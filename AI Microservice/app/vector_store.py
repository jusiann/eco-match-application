"""Vektör deposu — hem in-memory hem pgvector destekli.

İki implementasyon aynı arayüzü paylaşır (add/search/get_texts/delete).
Üst katman kodu hangisinin kullanıldığını bilmez.
"""
import logging
import numpy as np
import psycopg2
from psycopg2.extras import execute_values
from app.config import settings

logger = logging.getLogger(__name__)


class InMemoryVectorStore:
    """Geliştirme/test için bellek-içi depo (mevcut kod, dokunmadık)."""

    def __init__(self) -> None:
        self._store: dict[int, tuple[str, np.ndarray, str | None]] = {}

    def add(self, record_id, record_type: str, vector: list[float], text: str | None = None) -> None:
        self._store[record_id] = (record_type, np.array(vector, dtype=np.float32), text)
        logger.info("Vektör eklendi (bellek): id=%s type=%s", record_id, record_type)

    def search(self, query_vector: list[float], record_type: str,
               threshold: float = 0.60, limit: int = 20) -> list[dict]:
        q = np.array(query_vector, dtype=np.float32)
        q_norm = q / np.linalg.norm(q)
        results = []
        for rid, (rtype, vec, _text) in self._store.items():
            if rtype != record_type:
                continue
            v_norm = vec / np.linalg.norm(vec)
            similarity = float(np.dot(q_norm, v_norm))
            if similarity > threshold:
                results.append({"record_id": rid, "similarity": round(similarity, 4)})
        results.sort(key=lambda x: x["similarity"], reverse=True)
        return results[:limit]

    def get_texts(self, record_type: str) -> list[dict]:
        """BM25 hibrit indeksi için metni olan kayıtları döner (bkz. PgVectorStore.get_texts)."""
        return [
            {"record_id": rid, "text": text}
            for rid, (rtype, _vec, text) in self._store.items()
            if rtype == record_type and text
        ]

    def delete(self, record_id) -> None:
        self._store.pop(record_id, None)

    def count(self) -> int:
        return len(self._store)


class PgVectorStore:
    """PostgreSQL + pgvector ile gerçek vektör deposu (production)."""

    def __init__(self) -> None:
        self._conn = None

    def connect(self) -> None:
        """Veritabanına bağlan. Servis açılışında BİR KEZ çağrılır."""
        if self._conn is not None:
            return
        self._conn = psycopg2.connect(
            host=settings.db_host,
            port=settings.db_port,
            dbname=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
        )
        self._conn.autocommit = True
        # init.sql yalnızca boş bir volume'de çalışır (Docker init-script kuralı) --
        # daha önce oluşturulmuş bir embeddings tablosunda text kolonu eksik kalabilir.
        # Bu ALTER init.sql ile senkron tutulmalı (bkz. orada bırakılan not).
        with self._conn.cursor() as cur:
            cur.execute("ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS text TEXT")
        logger.info("pgvector bağlantısı kuruldu: %s:%s/%s",
                     settings.db_host, settings.db_port, settings.db_name)

    def disconnect(self) -> None:
        """Bağlantıyı kapat. Servis kapanırken çağrılır."""
        if self._conn:
            self._conn.close()
            self._conn = None
            logger.info("pgvector bağlantısı kapatıldı.")

    def _ensure_connected(self) -> None:
        if self._conn is None or self._conn.closed:
            raise RuntimeError("pgvector bağlantısı yok. Önce connect() çağır.")

    def get_connection(self):
        """Ham psycopg2 bağlantısını döndürür.

        Amaç: DB bağlantısının tek noktadan (burası) yönetilmesi — classifier
        gibi başka modüller kendi ayrı bağlantısını açmak yerine bunu kullanır.
        Bağlantı yoksa None döner; çağıran taraf kontrol etmeli.
        """
        return self._conn

    def is_healthy(self) -> bool:
        """DB bağlantısının gerçekten canlı olduğunu doğrular (health check için).

        Sadece self._conn'un None olmaması yeterli değil — bağlantı obje
        seviyesinde açık görünüp DB tarafında düşmüş olabilir. Bu yüzden
        hafif bir sorgu (SELECT 1) ile gerçek durumu teyit ederiz.
        """
        if self._conn is None or self._conn.closed:
            return False
        try:
            with self._conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
            return True
        except Exception as exc:  # noqa: BLE001 — health check'te her hata "bağlı değil" demektir
            logger.warning("pgvector health check başarısız: %s", exc)
            return False

    def add(self, record_id, record_type: str, vector: list[float], text: str | None = None) -> None:
        """Vektörü embeddings tablosuna ekle (varsa güncelle).

        text verilirse hibrit (BM25) aramanın korpusuna girer -- bkz. get_texts().
        Verilmezse (None) bu kayıt sadece SBERT aramasında yer alır, BM25 tarafında
        yok sayılır (kayıt eksik/eski, hata değil).
        """
        self._ensure_connected()
        vector_str = "[" + ",".join(str(v) for v in vector) + "]"
        with self._conn.cursor() as cur:
            cur.execute("""
                INSERT INTO embeddings (record_id, record_type, vector, text)
                VALUES (%s, %s, %s::vector, %s)
                ON CONFLICT (record_id, record_type)
                DO UPDATE SET vector = EXCLUDED.vector, text = EXCLUDED.text, created_at = NOW()
            """, (str(record_id), record_type, vector_str, text))
        logger.info("Vektör eklendi (pgvector): id=%s type=%s", record_id, record_type)

    def search(self, query_vector: list[float], record_type: str,
               threshold: float = 0.60, limit: int = 20) -> list[dict]:
        """Kosinüs benzerliği ile en yakın kayıtları bul (HNSW indeksi)."""
        self._ensure_connected()
        vector_str = "[" + ",".join(str(v) for v in query_vector) + "]"
        with self._conn.cursor() as cur:
            cur.execute("""
                SELECT record_id, 1 - (vector <=> %s::vector) AS similarity
                FROM embeddings
                WHERE record_type = %s
                  AND 1 - (vector <=> %s::vector) > %s
                ORDER BY similarity DESC
                LIMIT %s
            """, (vector_str, record_type, vector_str, threshold, limit))
            rows = cur.fetchall()
        return [{"record_id": row[0], "similarity": round(row[1], 4)} for row in rows]

    def get_texts(self, record_type: str) -> list[dict]:
        """BM25 hibrit indeksi için bir tipin metni olan tüm kayıtlarını döner.

        Eşik/limit uygulamaz -- BM25'in IDF istatistikleri tüm korpusa ihtiyaç duyar
        (bkz. app/hybrid_search.py). Pilot ölçekte (tek OSB, yüzlerce kayıt) tam
        taramanın maliyeti önemsiz; büyürse sayfalama/cache gerekebilir.
        """
        self._ensure_connected()
        with self._conn.cursor() as cur:
            cur.execute("""
                SELECT record_id, text FROM embeddings
                WHERE record_type = %s AND text IS NOT NULL
            """, (record_type,))
            rows = cur.fetchall()
        return [{"record_id": row[0], "text": row[1]} for row in rows]

    def delete(self, record_id) -> None:
        """Bir kaydın vektörünü sil."""
        self._ensure_connected()
        with self._conn.cursor() as cur:
            cur.execute("DELETE FROM embeddings WHERE record_id = %s", (str(record_id),))

    def count(self) -> int:
        """Depodaki toplam vektör sayısı."""
        self._ensure_connected()
        with self._conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM embeddings")
            return cur.fetchone()[0]


# Production'da pgvector, test'te in-memory
vector_store = PgVectorStore()
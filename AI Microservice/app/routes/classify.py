"""Sınıflandırma, benzerlik araması ve prototip yönetimi endpoint'leri."""
import logging
from fastapi import APIRouter, HTTPException
from app.schemas import (
    ClassifyRequest, ClassifyResponse,
    SearchRequest, SearchResponse,
    ReloadPrototypesRequest, ReloadPrototypesResponse,
)
from app.embedder import embedder, enrich_text
from app.classifier import classifier
from app.vector_store import vector_store
from app.hybrid_search import HybridSearcher
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    """Serbest metni en yakın malzeme kategorisine ata."""
    if not classifier.is_ready:
        logger.error("Sınıflandırma isteği geldi ama prototipler hazır değil.")
        raise HTTPException(status_code=503, detail="Sınıflandırıcı henüz hazır değil.")

    try:
        enriched = enrich_text(req.text)
        result = classifier.classify(enriched)
    except RuntimeError as exc:
        logger.error("Sınıflandırma hatası: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 — beklenmeyen hataları da 503 olarak raporla
        logger.exception("Sınıflandırma sırasında beklenmeyen hata: %s", exc)
        raise HTTPException(status_code=503, detail="Sınıflandırma sırasında beklenmeyen hata oluştu.")

    logger.info("Sınıflandırıldı: kategori=%s güven=%.4f", result["category"], result["confidence"])
    return ClassifyResponse(**result)


@router.post("/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    """Metni vektörle, SBERT (pgvector) + BM25 hibrit sonucunu bul.

    Hibrit füzyon app/hybrid_search.py'deki (alpha=BM25_ALPHA, GELISTIRME-RAPORU.md'de
    kalibre edilmiş) HybridSearcher ile yapılır. BM25 korpusu bu record_type için metni
    olan kayıtlardan kurulur (bkz. vector_store.get_texts) -- hiçbir kaydın metni yoksa
    (eski/eksik veri) sessizce saf SBERT sonucuna düşer.
    """
    try:
        enriched = enrich_text(req.text)
        vector = embedder.encode(enriched)
    except RuntimeError as exc:
        logger.error("Arama sırasında embed hatası: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))

    try:
        sbert_results = vector_store.search(
            query_vector=vector,
            record_type=req.record_type,
            threshold=req.threshold,
            limit=req.limit,
        )
        corpus = vector_store.get_texts(req.record_type)
    except RuntimeError as exc:
        # pgvector bağlantısı yoksa
        logger.error("Arama sırasında DB hatası: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 — DB tarafındaki beklenmeyen hataları 503 yap
        logger.exception("Arama sırasında beklenmeyen DB hatası: %s", exc)
        raise HTTPException(status_code=503, detail="Arama sırasında veritabanı hatası oluştu.")

    if corpus:
        # Her istek için ayrı örnek: paylaşılan bir singleton'ın _bm25/_corpus alanlarını
        # eşzamanlı istekler arasında yarış durumuna açık bırakmamak için (bu servis sync
        # def route'ları threadpool'da çalıştırıyor, bkz. AI entegrasyonu notları).
        searcher = HybridSearcher(alpha=settings.bm25_alpha)
        searcher.build_index(corpus)
        fused = searcher.search(enriched, sbert_results, top_k=req.limit)
        results = [
            {
                "record_id": r["record_id"],
                "similarity": r["hybrid_score"],
                "bm25_score": r["bm25_score"],
                "sbert_score": r["sbert_score"],
            }
            for r in fused
        ]
    else:
        results = sbert_results

    logger.info("Arama tamamlandı: %d sonuç bulundu (type=%s, hibrit=%s)",
                len(results), req.record_type, bool(corpus))
    return SearchResponse(results=results, query_text=enriched, total_found=len(results))


@router.post("/reload-prototypes", response_model=ReloadPrototypesResponse)
def reload_prototypes(req: ReloadPrototypesRequest) -> ReloadPrototypesResponse:
    """Bir kategoriye yeni örnekler ekle (DB'ye kalıcı yaz) ve tüm prototipleri
    DB'deki güncel veriyle yeniden hesapla."""
    category = req.category.upper()

    conn = vector_store.get_connection()
    if conn is None:
        logger.error("Prototip güncelleme denendi ama pgvector bağlantısı yok.")
        raise HTTPException(status_code=503, detail="pgvector bağlantısı yok.")

    try:
        # 1) Her örneği category_examples tablosuna yaz (mükerrerler atlanır)
        new_added = 0
        for example in req.examples:
            eklendi = classifier.add_example(conn, category, example, source="api")
            if eklendi:
                new_added += 1

        # 2) Tüm aktif örnekleri DB'den yeniden çek
        classifier.load_examples_from_db(conn)
        # 3) Prototipleri güncel örneklerle yeniden hesapla
        classifier.build_prototypes()
    except Exception as exc:  # noqa: BLE001 — DB veya model hatası, hepsi 503
        logger.exception("Prototip güncelleme sırasında hata: %s", exc)
        raise HTTPException(status_code=503, detail="Prototip güncelleme sırasında hata oluştu.")

    total = len(classifier.examples.get(category, []))
    logger.info(
        "Prototipler güncellendi: kategori=%s toplam_örnek=%d yeni_eklenen=%d",
        category, total, new_added,
    )
    return ReloadPrototypesResponse(
        status="ok", category=category, total_examples=total, new_added=new_added
    )

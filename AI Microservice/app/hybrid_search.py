"""Hibrit arama — BM25 (kelime) + SBERT (anlam) birleşimi."""
import logging
from rank_bm25 import BM25Okapi
from app.config import settings

logger = logging.getLogger(__name__)


class HybridSearcher:
    def __init__(self, alpha: float = settings.bm25_alpha):
        self.alpha = alpha
        self._corpus = []
        self._record_ids = []
        self._bm25 = None

    def build_index(self, documents: list[dict]):
        """BM25 indeksini oluştur.
        documents: [{"record_id": "x", "text": "malzeme açıklaması"}]"""
        self._corpus = [doc["text"] for doc in documents]
        self._record_ids = [doc["record_id"] for doc in documents]
        tokenized = [doc.lower().split() for doc in self._corpus]
        self._bm25 = BM25Okapi(tokenized)
        logger.info("BM25 indeksi oluşturuldu: %d döküman", len(documents))

    def search(self, query_text: str, sbert_results: list[dict], top_k: int = 20) -> list[dict]:
        """BM25 ve SBERT sonuçlarını Reciprocal Rank Fusion ile birleştir."""
        if self._bm25 is None:
            return sbert_results

        tokenized_query = query_text.lower().split()
        bm25_scores = self._bm25.get_scores(tokenized_query)

        # Min-max normalize
        bm25_min, bm25_max = min(bm25_scores), max(bm25_scores)
        if bm25_max > bm25_min:
            bm25_norm = {self._record_ids[i]: (s - bm25_min) / (bm25_max - bm25_min)
                         for i, s in enumerate(bm25_scores)}
        else:
            bm25_norm = {rid: 0.0 for rid in self._record_ids}

        sbert_dict = {r["record_id"]: r["similarity"] for r in sbert_results}
        all_ids = set(list(bm25_norm.keys()) + list(sbert_dict.keys()))

        hybrid_results = []
        for rid in all_ids:
            bm25_s = bm25_norm.get(rid, 0.0)
            sbert_s = sbert_dict.get(rid, 0.0)
            hybrid = self.alpha * bm25_s + (1 - self.alpha) * sbert_s
            hybrid_results.append({
                "record_id": rid,
                "hybrid_score": round(hybrid, 4),
                "bm25_score": round(bm25_s, 4),
                "sbert_score": round(sbert_s, 4),
            })

        hybrid_results.sort(key=lambda x: x["hybrid_score"], reverse=True)
        return hybrid_results[:top_k]


hybrid_searcher = HybridSearcher()

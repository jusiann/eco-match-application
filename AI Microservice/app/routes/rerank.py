"""Hibrit yeniden sıralama -- backend'in gerçek eşleştirme akışı için.

/search'ten farkı: /search AI'ın kendi (self-contained) pgvector korpusunda arar.
/rerank ise TAMAMEN stateless -- hiçbir DB'ye dokunmaz, candidates isteğin
içinde gelir. Backend (matches.service.ts) pgvector ile bulduğu topK adayı
SBERT benzerlikleriyle birlikte buraya gönderir, biz sadece BM25 ile füzyonlayıp
aynı kümeyi (elemesiz) yeniden sıralı döneriz. docs/07-ai-entegrasyonu.md'deki
sözleşmenin parçası -- backend gerçekten çağırır.
"""
import logging
from fastapi import APIRouter
from app.schemas import RerankRequest, RerankResponse, RerankResultItem
from app.hybrid_search import HybridSearcher
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/rerank", response_model=RerankResponse)
def rerank(req: RerankRequest) -> RerankResponse:
    """Verilen adayları BM25 + (istekte gelen) SBERT benzerliğiyle füzyonlar."""
    documents = [{"record_id": c.record_id, "text": c.text} for c in req.candidates]
    sbert_results = [{"record_id": c.record_id, "similarity": c.sbert_similarity} for c in req.candidates]

    # /search'teki gibi: her istek için taze örnek, paylaşılan singleton'ı
    # eşzamanlı isteklerin _bm25/_corpus alanlarında yarış durumuna açmamak için.
    searcher = HybridSearcher(alpha=settings.bm25_alpha)
    searcher.build_index(documents)
    # candidates kapalı bir küme -- sbert_results ve documents aynı record_id'lerden
    # geldiği için union hiçbir şeyi ne eler ne ekler, sadece yeniden sıralar.
    fused = searcher.search(req.query_text, sbert_results, top_k=len(documents))

    results = [
        RerankResultItem(
            record_id=r["record_id"],
            hybrid_score=r["hybrid_score"],
            bm25_score=r["bm25_score"],
            sbert_score=r["sbert_score"],
        )
        for r in fused
    ]
    logger.info("Rerank tamamlandı: %d aday, alpha=%.2f", len(documents), settings.bm25_alpha)
    return RerankResponse(results=results)

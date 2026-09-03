"""Embedding ve sağlık endpoint'leri."""
import logging
from fastapi import APIRouter, HTTPException
from app.schemas import (
    EmbedRequest, EmbedResponse,
    EmbedPassportRequest, EmbedPassportResponse,
    HealthResponse,
)
from app.embedder import embedder, build_text
from app.classifier import classifier
from app.config import settings
from app.vector_store import vector_store

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Servis, model ve DB bağlantı durumu."""
    db_connected = vector_store.is_healthy()
    classifier_ready = classifier.is_ready
    return HealthResponse(
        # Model, DB veya sınıflandırıcı hazır değilse servis "error" raporlanır
        status="ok" if (embedder.is_loaded and db_connected and classifier_ready) else "error",
        model_loaded=embedder.is_loaded,
        db_connected=db_connected,
        classifier_ready=classifier_ready,
        model_name=settings.model_name,
        vector_dim=settings.vector_dim,
    )


@router.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    """Metni 768 boyutlu vektöre çevir."""
    try:
        vector = embedder.encode(req.text)
    except RuntimeError as exc:
        # Model yüklü değilse 503 (servis hazır değil)
        logger.error("Embed hatası: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    return EmbedResponse(vector=vector, dim=len(vector))

@router.post("/embed/passport", response_model=EmbedPassportResponse)
def embed_passport(req: EmbedPassportRequest) -> EmbedPassportResponse:
    """Ham pasaport al, build_text ile birleştir, vektörle."""
    text = build_text(req.model_dump())
    if not text:
        raise HTTPException(
            status_code=422,
            detail="Pasaporttan anlamlı metin üretilemedi (tüm alanlar boş).",
        )
    try:
        vector = embedder.encode(text)
    except RuntimeError as exc:
        logger.error("Embed hatası: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc))
    return EmbedPassportResponse(vector=vector, dim=len(vector), built_text=text)
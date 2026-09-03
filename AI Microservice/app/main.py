"""DöngüNet AI Mikroservisi — FastAPI giriş noktası."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.config import settings
from app.embedder import embedder
from app.classifier import classifier
from app.routes import embed, classify
from app.vector_store import vector_store

# Logging kurulumu
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Servis açılırken model + DB yüklenir, kapanırken temizlik."""
    logger.info("Servis başlıyor...")
    embedder.load()  # fine-tuned model — eşleştirme (/embed, /search) için
    logger.info("Eşleştirme (fine-tuned) modeli hazır.")
    vector_store.connect()
    logger.info("pgvector bağlantısı hazır.")
    classifier.load_model()  # orijinal model — sınıflandırma (/classify) için
    classifier.load_examples_from_db(vector_store.get_connection())
    classifier.build_prototypes()  # kendi içinde "X kategori prototipi hazırlandı" logunu basar
    toplam_kategori = len(classifier.examples)
    toplam_ornek = sum(len(v) for v in classifier.examples.values())
    logger.info(
        "Servis hazır: Eşleştirme modeli: fine-tuned | Sınıflandırma modeli: orijinal | "
        "Prototipler: %d kategori %d örnek",
        toplam_kategori, toplam_ornek,
    )
    yield
    vector_store.disconnect()
    logger.info("Servis kapandı.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

# Endpoint'leri bağla
app.include_router(embed.router)
app.include_router(classify.router)
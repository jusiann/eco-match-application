"""Request/Response şemaları — backend ile aramızdaki kontrat."""
from typing import Literal
from pydantic import BaseModel, Field


class EmbedRequest(BaseModel):
    """Backend bize bunu gönderir."""
    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Vektöre dönüştürülecek malzeme metni",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "text": "Malzeme: Metal - Alaşımlı toz | Bileşim: Fe%71 Al%16"
            }
        }
    }


class EmbedResponse(BaseModel):
    """Biz backend'e bunu döneriz."""
    vector: list[float] = Field(..., description="768 boyutlu embedding")
    dim: int = Field(..., description="Vektör boyutu (her zaman 768)")


class HealthResponse(BaseModel):
    """Servis sağlık kontrolü."""
    status: str = Field(..., description="ok | error")
    model_loaded: bool = Field(..., description="Model belleğe yüklendi mi")
    db_connected: bool = Field(..., description="pgvector veritabanı bağlantısı canlı mı")
    classifier_ready: bool = Field(..., description="Sınıflandırıcı prototipleri hazır mı")
    model_name: str
    vector_dim: int

    model_config = {"protected_namespaces": ()}   # uyarıyı susturur
class EmbedPassportRequest(BaseModel):
    """Backend ham pasaport gönderir, biz build_text ile birleştiririz."""
    material_class: str
    physical_form: str | None = None
    composition: str | None = None
    usage_area: str | None = None
    quality_notes: str | None = None


class EmbedPassportResponse(BaseModel):
    """Vektör + hangi metnin üretildiği (debug için faydalı)."""
    vector: list[float]
    dim: int
    built_text: str   # backend ne vektörlendiğini görsün


class ClassifyRequest(BaseModel):
    """Serbest metni kategoriye atamak için gönderilen istek."""
    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Sınıflandırılacak serbest metin",
    )


class ClassifyResponse(BaseModel):
    """Sınıflandırma sonucu — en yakın kategori + tüm skorlar."""
    category: str = Field(..., description="En yakın kategori")
    confidence: float = Field(..., description="En yakın kategoriyle kosinüs benzerliği (0-1)")
    all_scores: dict[str, float] = Field(
        ..., description="Tüm kategorilerin skorları, büyükten küçüğe sıralı"
    )


class SearchRequest(BaseModel):
    """pgvector üzerinde benzerlik araması isteği."""
    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Aranacak malzeme metni",
    )
    record_type: Literal["input", "output"] = Field(
        default="input", description="Hangi tip kayıtlarda aranacak"
    )
    threshold: float = Field(
        default=0.60, ge=0.0, le=1.0, description="Minimum benzerlik eşiği"
    )
    limit: int = Field(
        default=20, ge=1, le=100, description="Maksimum sonuç sayısı"
    )


class SearchResponse(BaseModel):
    """Benzerlik arama sonucu."""
    results: list[dict] = Field(
        ...,
        description=(
            "[{record_id, similarity}] listesi. Korpusun metni varsa (hibrit arama "
            "devrede) similarity = hibrit skor olur ve ayrıca bm25_score/sbert_score "
            "kırılımı da eklenir; metin yoksa similarity saf SBERT kosinüs benzerliğidir."
        ),
    )
    query_text: str = Field(..., description="Zenginleştirilmiş arama metni (debug için)")
    total_found: int = Field(..., description="Bulunan sonuç sayısı")


class ReloadPrototypesRequest(BaseModel):
    """Bir kategoriye yeni örnekler ekleyip prototipleri yeniden hesaplama isteği."""
    category: str = Field(..., min_length=1, description="Örneklerin ekleneceği kategori")
    examples: list[str] = Field(
        ..., min_length=1, description="Kategoriye eklenecek yeni örnek cümleler"
    )


class ReloadPrototypesResponse(BaseModel):
    """Prototip güncelleme sonucu."""
    status: str = Field(..., description="ok")
    category: str
    total_examples: int = Field(..., description="Kategorinin DB'deki (aktif) toplam örnek sayısı")
    new_added: int = Field(..., description="Bu istekte gerçekten eklenen (mükerrer olmayan) örnek sayısı")


class RerankCandidate(BaseModel):
    """Backend'in pgvector ile zaten bulduğu bir aday -- SBERT benzerliği hazır gelir,
    AI servisi bunu yeniden hesaplamaz, sadece BM25 ile füzyonlar."""
    record_id: str = Field(..., min_length=1, description="Backend'deki input.id (round-trip, AI bunu saklamaz/aramaz)")
    text: str = Field(
        ..., min_length=1, max_length=5000,
        description="Adayın embedding'e giren AYNI metni (ör. buildInputText çıktısı) -- BM25 bununla tokenize eder",
    )
    sbert_similarity: float = Field(..., ge=0.0, le=1.0)


class RerankRequest(BaseModel):
    """Stateless yeniden sıralama isteği. AI servisi hiçbir şey saklamaz/aramaz --
    candidates tamamen bu istekle gelir, DB'ye dokunulmaz (bkz. docs/07 K-06).
    Backend'in gerçek eşleştirme akışı (matches.service.ts) pgvector ile bulduğu
    topK adayı buraya gönderir, biz sadece BM25+SBERT füzyon skorunu döneriz."""
    query_text: str = Field(..., min_length=1, max_length=5000, description="Çıktının embedding metni")
    candidates: list[RerankCandidate] = Field(..., min_length=1, max_length=200)


class RerankResultItem(BaseModel):
    record_id: str
    hybrid_score: float = Field(..., description="alpha*bm25 + (1-alpha)*sbert -- bkz. app/hybrid_search.py")
    bm25_score: float
    sbert_score: float = Field(..., description="İstekte gelen sbert_similarity ile aynı (round-trip)")


class RerankResponse(BaseModel):
    """candidates ile birebir aynı küme (hiçbiri elenmez/eklenmez), hibrit skora göre sıralı."""
    results: list[RerankResultItem]
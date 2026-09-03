"""SBERT model yönetimi — model bir kez yüklenir, tekrar tekrar kullanılır."""
import logging
from sentence_transformers import SentenceTransformer
from app.config import settings

logger = logging.getLogger(__name__)


class Embedder:
    """SBERT modelini sarmalar. Tek örnek (singleton) olarak kullanılır."""

    def __init__(self) -> None:
        self._model: SentenceTransformer | None = None

    def load(self) -> None:
        """Modeli belleğe yükle. Servis açılışında BİR KEZ çağrılır."""
        if self._model is not None:
            return
        logger.info("Model yükleniyor: %s", settings.model_name)
        self._model = SentenceTransformer(settings.model_name)

        # Boyut doğrulaması — yanlış model yüklenirse erkenden patla
        actual_dim = self._model.get_embedding_dimension()
        if actual_dim != settings.vector_dim:
            raise ValueError(
                f"Boyut uyuşmazlığı: model {actual_dim} üretiyor, "
                f"beklenen {settings.vector_dim}. Yanlış model olabilir."
            )
        logger.info("Model hazır. Vektör boyutu: %d", actual_dim)

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def encode(self, text: str) -> list[float]:
        """Metni 768 boyutlu vektöre çevir."""
        if self._model is None:
            raise RuntimeError("Model henüz yüklenmedi. Önce load() çağır.")
        vector = self._model.encode(text, normalize_embeddings=True)
        return vector.tolist()


def build_text(passport: dict) -> str:
    """Malzeme pasaportu alanlarını anlamsal bir metne birleştir.

    Sadece anlamsal ayırt ediciliği olan alanlar dahil edilir.
    Sayısal alanlar (miktar, fiyat) buraya GİRMEZ — onlar skorlama
    aşamasında (Node.js) işlenir.
    """
    # (etiket, alan_adı) — sıralama önemli: en ayırt edici önce
    fields = [
        ("Malzeme", "material_class"),
        ("Form", "physical_form"),
        ("Bileşim", "composition"),
        ("Kullanım", "usage_area"),
        ("Kalite", "quality_notes"),
    ]
    parts = []
    for label, key in fields:
        value = passport.get(key)
        if value:  # boş/None alanları atla
            parts.append(f"{label}: {value}")
    raw = " | ".join(parts)
    return enrich_text(raw)


# Türkçe endüstriyel kısaltma sözlüğü
ABBREVIATIONS: dict[str, str] = {
    "DKP": "soğuk haddelenmiş düşük karbonlu çelik (DKP)",
    "HRP": "sıcak haddelenmiş çelik (HRP)",
    "AISI": "amerikan demir çelik standardı (AISI)",
    "PP": "polipropilen (PP)",
    "PE": "polietilen (PE)",
    "LDPE": "düşük yoğunluklu polietilen (LDPE)",
    "HDPE": "yüksek yoğunluklu polietilen (HDPE)",
    "PET": "polietilen tereftalat (PET)",
    "PVC": "polivinil klorür (PVC)",
    "ABS": "akrilonitril bütadien stiren (ABS)",
    "PC": "polikarbonat (PC)",
    "PA": "poliamid naylon (PA)",
    "PU": "poliüretan (PU)",
    "XLPE": "çapraz bağlı polietilen (XLPE)",
    "EWC": "avrupa atık kataloğu (EWC)",
    "VOC": "uçucu organik bileşik (VOC)",
    "IPA": "izopropil alkol (IPA)",
    "CNC": "bilgisayarlı sayısal kontrol (CNC)",
    "OSB": "organize sanayi bölgesi (OSB)",
}

# Türkçe domain terimleri sözlüğü — modelin bilmediği kavramlar
DOMAIN_TERMS: dict[str, str] = {
    "küspe": "şeker pancarı küspesi, lifli hayvan yemi hammaddesi",
    "prina": "zeytin posası, zeytinyağı yan ürünü, biyokütle yakıtı",
    "tufal": "demir oksit pulları, haddeleme yan ürünü",
    "dross": "metal oksit cürufu, ergitme yüzey atığı",
    "cullet": "cam kırığı, fırın beslemesi için geri dönüşüm camı",
    "çapak": "kesim ve kalıplama sonrası oluşan fazla malzeme artığı",
    "fire": "üretim sürecinde oluşan malzeme kaybı ve artık",
    "şoddy": "rejenere tekstil elyafı, mekanik olarak açılmış kumaş lifi",
    "briketleme": "metal talaş ve tozu sıkıştırarak briket oluşturma",
    "regranülasyon": "plastik atığı eritip yeniden granül haline getirme",
    "dekapaj": "metal yüzeyden oksit ve pas temizleme asit banyosu",
}


def enrich_text(text: str) -> str:
    """Kısaltmaları ve domain terimlerini açarak metni zenginleştir.

    SBERT İngilizce ağırlıklı — Türkçe kısaltmalar ve jargon
    modelin kör noktası. Bu fonksiyon metni modelin anlayacağı
    hale getirir. Vektör kalitesini doğrudan artırır.
    """
    enriched = text
    # Kısaltmaları aç
    for abbr, expansion in ABBREVIATIONS.items():
        # Tam kelime eşleşmesi (kısa kelimelerin parça eşleşmesini önle)
        enriched = enriched.replace(f" {abbr} ", f" {expansion} ")
        if enriched.startswith(f"{abbr} "):
            enriched = f"{expansion} " + enriched[len(abbr)+1:]
        if enriched.endswith(f" {abbr}"):
            enriched = enriched[:-len(abbr)] + expansion

    # Domain terimlerini zenginleştir
    lower = enriched.lower()
    additions = []
    for term, explanation in DOMAIN_TERMS.items():
        if term in lower:
            additions.append(explanation)

    if additions:
        enriched = enriched + " | Bağlam: " + ", ".join(additions)

    return enriched
# Tüm uygulama bu tek örneği paylaşır
embedder = Embedder()
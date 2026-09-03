"""Prototip tabanlı malzeme sınıflandırma — SBERT ile, eğitim gerektirmez.

Mantık: Her kategori için örnek cümleler tanımlanır. Bu örneklerin
vektör ortalaması o kategorinin "prototipi" olur. Gelen metin, en yakın
prototipin kategorisine atanır. Veri biriktikçe örnekler genişletilebilir.
"""
import logging
import numpy as np

logger = logging.getLogger(__name__)

# Sınıflandırma için kullanılan model — eşleştirmede kullanılan fine-tuned
# modelden BİLEREK farklı. Fine-tuning embedding uzayını eşleşme ilişkisine
# göre bozduğu için kategori grupları dağılıyor; sınıflandırma bu yüzden
# ayrı bir modelle yapılır. all-mpnet-base-v2 İngilizce ağırlıklı olduğundan
# Türkçe örnek/sorgu metinlerinde semantiği güvenilir ayırt edemiyor (ölçüldü:
# alakasız kategoriyle benzerlik doğru kategoriden yüksek çıkabiliyor) — bu
# yüzden Türkçe'yi de destekleyen multilingual model kullanılıyor.
CLASSIFIER_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"

# Her kategori için temsili örnek cümleler.
# Veri arttıkça bu listeleri genişlet — yeniden eğitim gerekmez.
CATEGORY_EXAMPLES: dict[str, list[str]] = {
    "METAL": [
        "CNC dik işlem merkezinden kaynaklanan bor yağı ile kontamine karbon çeliği talaşı",
        "304 kalite paslanmaz sac lazer kesim hattı kırpıntı ve çapakları",
        "alüminyum ekstrüzyon profillerinin 6063 alaşım kafa-kuyruk kesim kalıntıları",
        "kablo sıyırma tesisinden elde edilen yüksek saflıkta kırma bakır granülü",
        "çelik haddeleme prosesinden kaynaklanan demir oksit esaslı tufal",
        "pirinç vana gövdesi işleme operasyonundan çıkan torna talaşı",
        "galvanizli sac delme ve bükme hattından kaynaklanan çinko kaplamalı şerit hurdaları",
        "otomotiv yan sanayi pres hattı sonrası oluşan DKP sac parça atıkları",
    ],
    "PLASTIK": [
        "enjeksiyon kalıplama hattı başlangıç renk geçişlerinden kaynaklanan şeffaf PP takoz atıkları",
        "beyaz eşya iç gövde üretiminden çıkan kırma yüksek yoğunluklu polietilen parçaları",
        "baskısız LDPE streç film ve ambalaj paketleme hattı kesim firesi",
        "otomotiv tampon imalatından kaynaklanan boyasız PC/ABS plastik hurdası",
        "PVC boru ekstrüzyon hattında oluşan sert PVC çapak ve uç kesim fireleri",
        "PET levha termoform üretiminden çıkan gıda ile temas etmemiş iskelet firesi",
        "ABS beyaz eşya panel enjeksiyonunda oluşan renkli çapak ve yolluklar",
        "polikarbonat levha kesiminden çıkan şeffaf PC kırpıntıları",
    ],
    "ORGANIK": [
        "kereste fabrikası tomruk soyma hattından çıkan yüksek ligninli çam kabukları",
        "meyve suyu üretiminden kalan yüksek nemli elma ve armut pres posası",
        "şeker pancarı işleme sonrası oluşan küspe",
        "bira üretiminde mayşeleme sonrası kalan malt posası",
        "gıda OSB sebze işleme hattından çıkan pırasa lahana ve kök kabukları",
        "zeytinyağı tesisinden çıkan zeytin posası ve prina",
        "ahşap mobilya imalatından çıkan tutkalsız kuru kayın talaşı",
        "nişasta üretiminden çıkan mısır lifli proses posası",
    ],
    "KIMYASAL": [
        "boya imalat hattı solvent bazlı tiner ve reaktör yıkama atık solventi",
        "metal kaplama hattı kullanılmış asidik dekapaj banyosu",
        "alkali temizleme prosesinden çıkan yağlı sodyum hidroksit çözeltisi",
        "biodizel üretiminden çıkan ham gliserin yan ürünü",
        "kimyasal gübre fabrikası fosforik asit üretimi yan ürünü fosfojips",
        "kullanılmış etilen glikol bazlı antifriz sıvısı",
        "deterjan üretim hattından çıkan yüzey aktif madde içerikli durulama suyu",
        "baskı tesisinden çıkan izopropil alkol bazlı nemlendirme suyu atığı",
    ],
    "TEKSTIL": [
        "konfeksiyon dikim atölyesinden çıkan yüzde yüz pamuklu denim kumaş kırpıntıları",
        "dokuma hattı kenarlarından çıkan polyester kumaş şerit fireleri",
        "iplik üretim prosesinden kaynaklanan pamuk lif topakları ve uçuntu",
        "pamuk polyester karışımlı örme kumaş kesim artıkları",
        "halı dokuma hattı kenar kesim PP iplik ve jüt taban atıkları",
        "denim yıkama ve taşlama sonrası oluşan pamuklu tekstil tozu",
        "boyasız beyaz pamuk kumaş kesim firesi",
        "yünlü kumaş kesim hattı kırpıntıları",
    ],
    "CAM": [
        "ısıcam üretim hattı CNC kesim masası sonrası oluşan şeffaf soda-kireç düz cam kırıkları",
        "cam ambalaj üretiminde renk ayrımlı yeşil şişe kırıkları",
        "otomotiv temperli cam kenar taşlama operasyonundan çıkan sulu cam tozu çamuru",
        "borosilikat cam tüp ve ampul üretim ıskartaları",
        "cam yünü üretim hattı bağlayıcı içeren cam elyaf tozu",
        "güneş paneli üretiminden çıkan düşük demirli temperli cam kırıkları",
        "cam mozaik üretiminden kalan renkli cam granülleri",
        "geri dönüştürülebilir temiz şeffaf cam ambalaj kırığı",
    ],
    "KAGIT": [
        "matbaa dergi ve kitap basımı sonrası oluşan kuşe kağıt kenar şeritleri",
        "ofis ve idari bina arşiv imhasından çıkan kırpılmış birinci hamur A4 kağıtları",
        "oluklu mukavva kutu üretim hattı kesim ve kalıp firesi",
        "kraft torba üretiminden çıkan temiz kraft kağıt kenar fireleri",
        "kağıt fabrikası elek altı selüloz lif çamuru",
        "kağıt bobin kenar trim firesi",
        "yumurta viyolü üretiminden kalan kurumuş kalıplama hamuru topakları",
        "karton ambalaj baskı sonrası UV laklı ve renkli baskılı fireler",
    ],
}

class Classifier:
    """Kategori prototiplerini hesaplar ve metni en yakın kategoriye atar.

    Örneklerin asıl kaynağı artık `category_examples` tablosudur (PostgreSQL).
    CATEGORY_EXAMPLES sözlüğü sadece DB boş/erişilemez olduğunda kullanılan
    başlangıç/fallback verisidir — böylece DB henüz kurulmamış ortamlarda da
    (ör. birim testleri) sınıflandırıcı çalışmaya devam eder.
    """

    def __init__(self) -> None:
        self._prototypes: dict[str, np.ndarray] = {}
        self._conn = None  # en son load_examples_from_db'ye verilen bağlantı
        self._model = None  # classifier'ın kendi modeli (embedder'dan bağımsız)
        # Başlangıçta CATEGORY_EXAMPLES ile doldur — DB'den yüklenene kadar
        # veya DB hiç bağlanmazsa bu, kullanılan tek kaynak olur.
        self.examples: dict[str, list[str]] = {
            cat: list(exs) for cat, exs in CATEGORY_EXAMPLES.items()
        }

    def load_model(self) -> None:
        """Sınıflandırma için orijinal SBERT modelini yükle (fine-tuned DEĞİL).

        Eşleştirme (embedder) fine-tuned modeli kullanırken, sınıflandırma
        kategori gruplarının bozulmaması için ayrı ve orijinal bir model
        kullanır. Servis açılışında bir kez çağrılır.
        """
        if self._model is not None:
            return
        from sentence_transformers import SentenceTransformer
        logger.info("Classifier modeli yükleniyor: %s", CLASSIFIER_MODEL_NAME)
        self._model = SentenceTransformer(CLASSIFIER_MODEL_NAME)
        logger.info("Classifier modeli yüklendi: %s (orijinal)", CLASSIFIER_MODEL_NAME)

    @property
    def is_model_loaded(self) -> bool:
        return self._model is not None

    def load_examples_from_db(self, conn) -> None:
        """category_examples tablosundan aktif (active=TRUE) örnekleri çeker.

        DB'de veri varsa self.examples DB'den gelenlerle değiştirilir.
        DB boşsa veya okuma başarısız olursa CATEGORY_EXAMPLES fallback'ine
        dönülür. Servis açılışında ve /reload-prototypes çağrısında kullanılır.
        """
        self._conn = conn
        examples: dict[str, list[str]] = {}
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT category, example
                    FROM category_examples
                    WHERE active = TRUE
                    ORDER BY category, id
                    """
                )
                rows = cur.fetchall()
            for category, example in rows:
                examples.setdefault(category, []).append(example)
        except Exception as exc:  # noqa: BLE001 — okuma hatasında fallback'e düş
            logger.error("category_examples tablosundan okuma başarısız: %s", exc)
            examples = {}

        if examples:
            self.examples = examples
            toplam = sum(len(v) for v in examples.values())
            logger.info("DB'den %d kategori, %d örnek yüklendi.", len(examples), toplam)
        else:
            self.examples = {cat: list(exs) for cat, exs in CATEGORY_EXAMPLES.items()}
            toplam = sum(len(v) for v in self.examples.values())
            logger.warning(
                "category_examples tablosu boş veya okunamadı — CATEGORY_EXAMPLES "
                "fallback kullanılıyor (%d kategori, %d örnek).",
                len(self.examples), toplam,
            )

    def add_example(self, conn, category: str, example: str, source: str = "manual") -> bool:
        """DB'ye yeni bir örnek ekler (varsa dokunmaz — ON CONFLICT DO NOTHING).

        Prototipleri YENİDEN HESAPLAMAZ — çağıran taraf gerekirse ayrıca
        load_examples_from_db() + build_prototypes() çağırmalı
        (bkz. /reload-prototypes akışı).
        """
        category = category.upper()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO category_examples (category, example, source)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (category, example) DO NOTHING
                    """,
                    (category, example, source),
                )
                eklendi = cur.rowcount > 0
        except Exception as exc:
            logger.error("Örnek eklenemedi (kategori=%s): %s", category, exc)
            raise

        if eklendi:
            logger.info("Yeni örnek eklendi: kategori=%s source=%s", category, source)
        else:
            logger.info("Örnek zaten mevcuttu, atlandı: kategori=%s", category)
        return eklendi

    def remove_example(self, conn, example_id: int) -> bool:
        """Bir örneği soft-delete yapar (active=FALSE) — fiziksel silme yapmaz."""
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE category_examples SET active = FALSE WHERE id = %s",
                    (example_id,),
                )
                guncellendi = cur.rowcount > 0
        except Exception as exc:
            logger.error("Örnek pasifleştirilemedi (id=%s): %s", example_id, exc)
            raise

        if guncellendi:
            logger.info("Örnek pasifleştirildi: id=%s", example_id)
        else:
            logger.warning("Pasifleştirilecek örnek bulunamadı: id=%s", example_id)
        return guncellendi

    def build_prototypes(self, conn=None) -> None:
        """Aktif örnekleri vektörleyip her kategorinin prototipini (ortalama
        vektör) hesaplar. Servis açılışında model yüklendikten sonra çağrılır.

        conn verilirse önce load_examples_from_db() ile taze örnekler çekilir.
        Verilmezse self.examples'daki mevcut veri (en son yüklenen ya da
        CATEGORY_EXAMPLES fallback) kullanılır — böylece art arda birden fazla
        gereksiz DB sorgusu yapılmaz.
        """
        if self._model is None:
            raise RuntimeError("Classifier modeli henüz yüklenmedi. Önce load_model() çağır.")

        if conn is not None:
            self.load_examples_from_db(conn)

        self._prototypes = {}
        for category, examples in self.examples.items():
            if not examples:
                continue
            # Prototipler classifier'ın KENDİ modeliyle hesaplanır (embedder değil)
            vectors = [
                np.array(self._model.encode(ex, normalize_embeddings=True))
                for ex in examples
            ]
            # Ortalama vektör = kategorinin prototipi
            prototype = np.mean(vectors, axis=0)
            self._prototypes[category] = prototype / np.linalg.norm(prototype)
        logger.info("%d kategori prototipi hazırlandı.", len(self._prototypes))

    @property
    def is_ready(self) -> bool:
        return len(self._prototypes) > 0

    def classify(self, text: str) -> dict:
        """Metni en yakın kategoriye ata. Tüm skorları da döndür."""
        if not self._prototypes:
            raise RuntimeError("Prototipler hazır değil. build_prototypes() çağır.")
        if self._model is None:
            raise RuntimeError("Classifier modeli henüz yüklenmedi. Önce load_model() çağır.")

        # Classifier kendi modeliyle encode eder (embedder ile karıştırılmaz)
        q = np.array(self._model.encode(text, normalize_embeddings=True))
        q = q / np.linalg.norm(q)

        # Her kategoriyle kosinüs benzerliği
        scores = {
            cat: float(np.dot(q, proto))
            for cat, proto in self._prototypes.items()
        }
        # En yüksek skorlu kategori
        best = max(scores, key=scores.get)

        return {
            "category": best,
            "confidence": round(scores[best], 4),
            "all_scores": {k: round(v, 4) for k, v in
                           sorted(scores.items(), key=lambda x: x[1], reverse=True)},
        }


# Tek paylaşılan örnek
classifier = Classifier()
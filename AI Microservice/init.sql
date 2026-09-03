-- pgvector eklentisini etkinleştir
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings tablosu (rapordaki şemaya birebir uyumlu)
CREATE TABLE IF NOT EXISTS embeddings (
    id          SERIAL PRIMARY KEY,
    record_id   VARCHAR(100) NOT NULL,
    record_type VARCHAR(10)  NOT NULL CHECK (record_type IN ('input', 'output')),
    vector      vector(768)  NOT NULL,
    created_at  TIMESTAMP    DEFAULT NOW()
);

-- HNSW indeksi — hızlı kosinüs benzerlik araması
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
    ON embeddings USING hnsw (vector vector_cosine_ops);

-- record_id + record_type için unique kısıt (aynı kayıt iki kez eklenmez)
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_record
    ON embeddings (record_id, record_type);

-- Sınıflandırıcı kategori örnekleri — classifier.py'daki CATEGORY_EXAMPLES'ın
-- kalıcı, güncellenebilir hali. Artık asıl kaynak burasıdır; kod içindeki
-- sözlük sadece DB boşken kullanılan başlangıç/fallback verisidir.
CREATE TABLE IF NOT EXISTS category_examples (
    id          SERIAL PRIMARY KEY,
    category    VARCHAR(50)  NOT NULL,
    example     TEXT         NOT NULL,
    source      VARCHAR(20)  DEFAULT 'manual',
    active      BOOLEAN      DEFAULT TRUE,
    created_at  TIMESTAMP    DEFAULT NOW(),
    UNIQUE(category, example)
);

-- Aktif örnekleri kategoriye göre hızlı çekmek için indeks
CREATE INDEX IF NOT EXISTS idx_category_examples_active
    ON category_examples (category) WHERE active = TRUE;

-- category_examples başlangıç verisi — CATEGORY_EXAMPLES sözlüğünden aktarılır
-- 7 kategori: METAL, PLASTIK, ORGANIK, KIMYASAL, TEKSTIL, CAM, KAGIT
INSERT INTO category_examples (category, example, source) VALUES
    ('METAL', 'CNC dik işlem merkezinden kaynaklanan bor yağı ile kontamine karbon çeliği talaşı', 'seed'),
    ('METAL', '304 kalite paslanmaz sac lazer kesim hattı kırpıntı ve çapakları', 'seed'),
    ('METAL', 'alüminyum ekstrüzyon profillerinin 6063 alaşım kafa-kuyruk kesim kalıntıları', 'seed'),
    ('METAL', 'kablo sıyırma tesisinden elde edilen yüksek saflıkta kırma bakır granülü', 'seed'),
    ('METAL', 'çelik haddeleme prosesinden kaynaklanan demir oksit esaslı tufal', 'seed'),
    ('METAL', 'pirinç vana gövdesi işleme operasyonundan çıkan torna talaşı', 'seed'),
    ('METAL', 'galvanizli sac delme ve bükme hattından kaynaklanan çinko kaplamalı şerit hurdaları', 'seed'),
    ('METAL', 'otomotiv yan sanayi pres hattı sonrası oluşan DKP sac parça atıkları', 'seed'),
    ('PLASTIK', 'enjeksiyon kalıplama hattı başlangıç renk geçişlerinden kaynaklanan şeffaf PP takoz atıkları', 'seed'),
    ('PLASTIK', 'beyaz eşya iç gövde üretiminden çıkan kırma yüksek yoğunluklu polietilen parçaları', 'seed'),
    ('PLASTIK', 'baskısız LDPE streç film ve ambalaj paketleme hattı kesim firesi', 'seed'),
    ('PLASTIK', 'otomotiv tampon imalatından kaynaklanan boyasız PC/ABS plastik hurdası', 'seed'),
    ('PLASTIK', 'PVC boru ekstrüzyon hattında oluşan sert PVC çapak ve uç kesim fireleri', 'seed'),
    ('PLASTIK', 'PET levha termoform üretiminden çıkan gıda ile temas etmemiş iskelet firesi', 'seed'),
    ('PLASTIK', 'ABS beyaz eşya panel enjeksiyonunda oluşan renkli çapak ve yolluklar', 'seed'),
    ('PLASTIK', 'polikarbonat levha kesiminden çıkan şeffaf PC kırpıntıları', 'seed'),
    ('ORGANIK', 'kereste fabrikası tomruk soyma hattından çıkan yüksek ligninli çam kabukları', 'seed'),
    ('ORGANIK', 'meyve suyu üretiminden kalan yüksek nemli elma ve armut pres posası', 'seed'),
    ('ORGANIK', 'şeker pancarı işleme sonrası oluşan küspe', 'seed'),
    ('ORGANIK', 'bira üretiminde mayşeleme sonrası kalan malt posası', 'seed'),
    ('ORGANIK', 'gıda OSB sebze işleme hattından çıkan pırasa lahana ve kök kabukları', 'seed'),
    ('ORGANIK', 'zeytinyağı tesisinden çıkan zeytin posası ve prina', 'seed'),
    ('ORGANIK', 'ahşap mobilya imalatından çıkan tutkalsız kuru kayın talaşı', 'seed'),
    ('ORGANIK', 'nişasta üretiminden çıkan mısır lifli proses posası', 'seed'),
    ('KIMYASAL', 'boya imalat hattı solvent bazlı tiner ve reaktör yıkama atık solventi', 'seed'),
    ('KIMYASAL', 'metal kaplama hattı kullanılmış asidik dekapaj banyosu', 'seed'),
    ('KIMYASAL', 'alkali temizleme prosesinden çıkan yağlı sodyum hidroksit çözeltisi', 'seed'),
    ('KIMYASAL', 'biodizel üretiminden çıkan ham gliserin yan ürünü', 'seed'),
    ('KIMYASAL', 'kimyasal gübre fabrikası fosforik asit üretimi yan ürünü fosfojips', 'seed'),
    ('KIMYASAL', 'kullanılmış etilen glikol bazlı antifriz sıvısı', 'seed'),
    ('KIMYASAL', 'deterjan üretim hattından çıkan yüzey aktif madde içerikli durulama suyu', 'seed'),
    ('KIMYASAL', 'baskı tesisinden çıkan izopropil alkol bazlı nemlendirme suyu atığı', 'seed'),
    ('TEKSTIL', 'konfeksiyon dikim atölyesinden çıkan yüzde yüz pamuklu denim kumaş kırpıntıları', 'seed'),
    ('TEKSTIL', 'dokuma hattı kenarlarından çıkan polyester kumaş şerit fireleri', 'seed'),
    ('TEKSTIL', 'iplik üretim prosesinden kaynaklanan pamuk lif topakları ve uçuntu', 'seed'),
    ('TEKSTIL', 'pamuk polyester karışımlı örme kumaş kesim artıkları', 'seed'),
    ('TEKSTIL', 'halı dokuma hattı kenar kesim PP iplik ve jüt taban atıkları', 'seed'),
    ('TEKSTIL', 'denim yıkama ve taşlama sonrası oluşan pamuklu tekstil tozu', 'seed'),
    ('TEKSTIL', 'boyasız beyaz pamuk kumaş kesim firesi', 'seed'),
    ('TEKSTIL', 'yünlü kumaş kesim hattı kırpıntıları', 'seed'),
    ('CAM', 'ısıcam üretim hattı CNC kesim masası sonrası oluşan şeffaf soda-kireç düz cam kırıkları', 'seed'),
    ('CAM', 'cam ambalaj üretiminde renk ayrımlı yeşil şişe kırıkları', 'seed'),
    ('CAM', 'otomotiv temperli cam kenar taşlama operasyonundan çıkan sulu cam tozu çamuru', 'seed'),
    ('CAM', 'borosilikat cam tüp ve ampul üretim ıskartaları', 'seed'),
    ('CAM', 'cam yünü üretim hattı bağlayıcı içeren cam elyaf tozu', 'seed'),
    ('CAM', 'güneş paneli üretiminden çıkan düşük demirli temperli cam kırıkları', 'seed'),
    ('CAM', 'cam mozaik üretiminden kalan renkli cam granülleri', 'seed'),
    ('CAM', 'geri dönüştürülebilir temiz şeffaf cam ambalaj kırığı', 'seed'),
    ('KAGIT', 'matbaa dergi ve kitap basımı sonrası oluşan kuşe kağıt kenar şeritleri', 'seed'),
    ('KAGIT', 'ofis ve idari bina arşiv imhasından çıkan kırpılmış birinci hamur A4 kağıtları', 'seed'),
    ('KAGIT', 'oluklu mukavva kutu üretim hattı kesim ve kalıp firesi', 'seed'),
    ('KAGIT', 'kraft torba üretiminden çıkan temiz kraft kağıt kenar fireleri', 'seed'),
    ('KAGIT', 'kağıt fabrikası elek altı selüloz lif çamuru', 'seed'),
    ('KAGIT', 'kağıt bobin kenar trim firesi', 'seed'),
    ('KAGIT', 'yumurta viyolü üretiminden kalan kurumuş kalıplama hamuru topakları', 'seed'),
    ('KAGIT', 'karton ambalaj baskı sonrası UV laklı ve renkli baskılı fireler', 'seed')
ON CONFLICT (category, example) DO NOTHING;
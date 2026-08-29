# 01 · Proje Genel Bakış

## Problem

Organize Sanayi Bölgelerinde bir tesisin atığı, çoğu zaman birkaç yüz metre ötedeki başka
bir tesisin hammaddesidir. Ama kimse bunu bilmez.

Bugün olan şey şu: çevre mühendisi atığı Excel'de takip eder, bertaraf firmasına para
ödeyerek gönderir. Aynı OSB'de o malzemeyi satın almak isteyen tesis, onu bambaşka bir
tedarikçiden alır. İki taraf da kaybeder, karbon ayak izi iki kere yazılır.

Bu eşleşmenin kurulamamasının üç sebebi var:

1. **Görünürlük yok.** Hangi tesiste ne çıkıyor, kimse merkezî olarak bilmiyor.
2. **Sınıflandırma elle yapılıyor.** "Arıtma çamuru" mu, "organik atık" mı, "biyokütle" mi?
   Herkes farklı yazıyor, aramak imkânsız hâle geliyor.
3. **Evrak yükü caydırıcı.** Alıcı tesis, aldığı malzemenin ne olduğunu belgelemek zorunda
   (ESPR/DPP). AB'ye ihracat yapıyorsa karbon hesabını da vermek zorunda (CBAM). Bu
   evrakları elle hazırlamak günler sürüyor.

## Çözüm

EcoMatch bu üç problemi tek akışta bağlar:

```
Tesis çıktısını serbest metin olarak yazar
        ↓
AI metni 768 boyutlu vektöre çevirir + malzeme sınıfını önerir
        ↓
pgvector, anlamsal olarak yakın "girdi ihtiyaçları"nı bulur (cosine ≥ 0.60)
        ↓
5 faktörlü skorlama: malzeme · kalite · çevre · lojistik · ekonomi
        ↓
En iyi 10 aday, skor + mesafe + CO2 tasarrufu ile listelenir
        ↓
Karşılıklı kabul → iletişim bilgileri açılır
        ↓
DPP (dijital ürün pasaportu) + CBAM raporu otomatik üretilir
```

Kritik olan kısım **serbest metin girişi**. Kullanıcıya "kategori seç" dedirtmiyoruz;
o kendi diliyle yazıyor, sistem anlıyor. Anlamadığında (güven < 0.80) da uydurmuyor —
uzmana soruyor.

## Değer önerisi, kime ne veriyor

| Kim | Ne kazanıyor |
|---|---|
| Tesis (Aylin) | Bertaraf maliyeti yerine gelir; DPP ve CBAM evrakı otomatik |
| Alıcı tesis (Ali) | Daha ucuz ve yakın hammadde, izlenebilir kaynakla |
| OSB yönetimi (Mehmet) | Bölgenin döngüsellik oranı ölçülebilir hâle geliyor, Bakanlık raporu tek tık |
| Regülasyon | ESPR ve CBAM uyumu sistemin doğal çıktısı, ayrı bir iş değil |

## Aktörler

Use Case diyagramındaki altı aktör. Yetki modeli bunların üzerine kurulu
(bkz. [03-veri-modeli.md](03-veri-modeli.md) `user_role`).

| Aktör | Rol kodu | Ne yapar |
|---|---|---|
| Tesis Kullanıcısı | `USER`, `FACILITY_ADMIN` | Çıktı/girdi kaydeder, eşleşme arar, kabul/red verir, rapor indirir |
| OSB Yöneticisi | `OSB_MANAGER` | Bölge dashboard'u, toplu istatistik, bölgesel rapor |
| Sistem Admini | `ADMIN` | Tesis doğrulama, kullanıcı yönetimi, AHP ağırlıkları, karbon faktörleri |
| Uzman (HITL) | `EXPERT` | Düşük güvenli sınıflandırmaları inceler, onaylar veya reddeder |
| IoT Sensör | — (`api_keys`) | Tank/stok verisi gönderir (opsiyonel modül) |
| Claude API | — (dış servis) | Chatbot cevaplarını üretir |

## Personalar

Senaryolarda geçen dört kullanıcı. Tasarım kararı verirken "bu ekranı Mehmet mi
kullanacak Aylin mi" diye sormak, çoğu tartışmayı kısa kesiyor.

### Aylin Yıldız — Tesis Çevre Mühendisi
Doku Tekstil A.Ş., Bursa Nilüfer OSB. 28 yaşında, 2 yıl deneyim, **mobil öncelikli**.
Haftada 3-4 kez, ortalama 15 dakika kullanır.

*Acı noktaları:* Atık türünü elle sınıflandırmak vakit alıyor · bertaraf maliyeti artıyor ·
CBAM için elle veri toplamak günler sürüyor · atığı alacak firmayı bulmak telefon-e-posta
trafiği gerektiriyor.

*Beklentisi:* Bir formu doldurup sistemin eşleştirme yapması · DPP'nin PDF olarak hazır
gelmesi · fabrikadayken telefondan hızlıca kayıt açabilmesi.

> "Amacım atığı çöp olarak değil, satılabilir bir yan ürün olarak yönetmek."

### Mehmet Kaya — OSB Müdürü
Bursa Nilüfer OSB Yönetimi. 54 yaşında, 12 yıl deneyim, **web/panel kullanıcısı**,
mobil kullanmıyor. Haftada 1-2 kez, 20 dakika.

*Acı noktaları:* Bölgedeki toplam atık akışını göremiyor · hangi tesisin ne kadar CO2
tasarrufu yaptığı bilinmiyor · Bakanlık raporlarını elle hazırlıyor.

> "Bir tesisin atığı diğerinin girdisi oluyorsa, bunu bilmek benim işim. Ama şu an bilmiyorum."

### Ayşe Demir — Sistem Admini
EcoMatch operasyon ekibi. 32 yaşında, ileri düzey, terminal + admin panel karışık kullanır.
Her iş günü 1-2 saat.

*Acı noktaları:* Kullanıcı taleplerine hızlı cevap gerekiyor · karbon faktörleri değişince
her yeri güncellemek dert · anormal eşleşmeleri manuel yakalamak zor.

### Prof. Dr. Kaan Öztürk — HITL Uzmanı
Çevre Mühendisliği bölümü, yarı zamanlı danışman. 48 yaşında, web panel, mobil kullanmaz.
Haftada 2-3 kez, oturum başı 30 dakika.

*Acı noktaları:* Sadece belirli saatler ayırabiliyor · her eşleşmenin bağlamını yeniden
okumak sıkıcı · reddetme gerekçelerinin AI'ı eğitmesini istiyor.

*Bu yüzden:* toplu inceleme (batch review), yan yana karşılaştırma ve klavye kısayolları
uzman panelinde opsiyonel değil, zorunlu tasarım gereksinimi.

### Ekran öncelik matrisi

| Persona | Web | Mobil | API |
|---|---|---|---|
| Aylin (Tesis) | Yüksek | **Yüksek** (saha kaydı) | Düşük |
| Mehmet (OSB) | **Yüksek** (dashboard) | Düşük | Düşük |
| Ayşe (Admin) | Yüksek | Yok | **Yüksek** (script/CLI) |
| Kaan (Uzman) | Yüksek | Yok | Yok |

## Sözlük

Bu terimler dokümanların her yerinde geçiyor; kısaltmaları açık yazmıyoruz.

| Terim | Açılım / Anlam |
|---|---|
| **Endüstriyel simbiyoz** | Bir tesisin atığının başka bir tesise hammadde olması |
| **OSB** | Organize Sanayi Bölgesi |
| **Output** | Bir tesisin ürettiği atık / yan ürün — arz tarafı |
| **Input** | Bir tesisin aradığı girdi ihtiyacı — talep tarafı |
| **Match** | Bir output ile bir input arasında sistemin kurduğu skorlu eşleşme |
| **DPP** | Digital Product Passport — malzemenin kimlik belgesi (AB ESPR gereği) |
| **ESPR** | Ecodesign for Sustainable Products Regulation — DPP'yi zorunlu kılan AB mevzuatı |
| **CBAM** | Carbon Border Adjustment Mechanism — AB sınırında karbon vergisi |
| **SBERT** | Sentence-BERT — metni anlamsal vektöre çeviren model (`all-mpnet-base-v2`) |
| **Embedding** | Metnin 768 boyutlu sayısal temsili; anlamsal arama bunun üzerinden yapılır |
| **pgvector** | PostgreSQL eklentisi; vektör benzerlik araması (HNSW indeksi ile) |
| **PostGIS** | PostgreSQL eklentisi; coğrafi mesafe hesabı (`ST_Distance`) |
| **Cosine similarity** | İki vektör arasındaki anlamsal yakınlık, 0-1 arası. Eşiğimiz 0.60 |
| **HITL** | Human-in-the-Loop — AI emin olamadığında insana sorma mekanizması |
| **AHP** | Analytic Hierarchy Process — skorlama ağırlıklarını kalibre etme yöntemi |
| **TRL** | Technology Readiness Level — teknoloji olgunluk seviyesi (1-9) |

## Sınırlar — bu proje ne değil

- **Pazaryeri değil.** Ödeme, sipariş, lojistik takibi yok. İki taraf eşleşince platform
  dışına çıkıp kendi anlaşmalarını yapıyorlar.
- **Bertaraf hizmeti değil.** Atığı kimse taşımıyor, sadece eşleştiriyoruz.
- **Yasal danışmanlık değil.** CBAM/DPP raporları hesaplama çıktısıdır; hukuki
  sorumluluğu tesise aittir. Her raporda hesaplama kaynağı ve tarihi yazar.

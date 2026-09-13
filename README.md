# EcoMatch

Organize Sanayi Bölgelerinde endüstriyel simbiyozu otomatikleştiren AI destekli platform.
Bir tesisin atığı, başka bir tesisin hammaddesi — EcoMatch bu eşleşmeyi bulur, skorlar ve
gerekli uyum belgelerini (DPP, CBAM) üretir.

**TEKNOFEST 2026** · Sıfır Atık & Döngüsel Ekonomi · Takım: VectorMatch · Takım ID: #1003771

## Hızlı başlangıç

```bash
git clone <repo-url>
cd eco-match-application
docker compose up --build
```

**Uygulama: `http://localhost:8080`** — kullanıcının bilmesi gereken tek adres.

> İlk kurulumda AI modeli indirilir (~5 dk). Sonraki başlatmalar çok daha hızlıdır.

Demo giriş bilgileri için bkz. [docs/11-demo-veri-seti.md](docs/11-demo-veri-seti.md).
Tüm hesaplar aynı şifreyi kullanır: `Ecomatch2026!`

Ayrıntılı kurulum rehberi: [docs/12-kurulum-kilavuzu.md](docs/12-kurulum-kilavuzu.md)

### Tek komutla neler ayağa kalkar?

`docker-compose.yml`, alt compose dosyalarını `include:` ile birleştirir. Tek
`docker compose up --build` komutuyla aşağıdaki tüm servisler hazır olur:

| Konteyner           | Servis                             | Port                    |
| ------------------- | ---------------------------------- | ----------------------- |
| `eco-match-web`     | Next.js SPA + nginx ters vekil     | `http://localhost:8080` |
| `eco-match-backend` | NestJS 10 + Fastify API            | `http://localhost:3001` |
| `eco-match-ai`      | FastAPI + SBERT AI mikroservisi    | `http://localhost:8000` |
| `eco-match-db`      | PostgreSQL 16 + pgvector + PostGIS | `localhost:5434`        |
| `ecomatch_pgvector` | AI mikroservisi pgvector DB        | `localhost:5433`        |

| Adres                            | Ne                                                 |
| -------------------------------- | -------------------------------------------------- |
| `http://localhost:8080`          | Web arayüzü **ve** API (aynı origin)               |
| `http://localhost:8080/api/docs` | Swagger, aynı vekil üzerinden                      |
| `http://localhost:3001`          | Backend'e doğrudan erişim (curl / e2e paketi için) |
| `http://localhost:8000`          | AI mikroservisine doğrudan erişim                  |
| `localhost:5434`                 | Backend PostgreSQL                                 |
| `localhost:5433`                 | AI mikroservisinin pgvector DB'si                  |

`web` konteynerindeki nginx, `/v1`, `/health`, `/socket.io` ve `/api/docs` yollarını
backend'e ters vekil (reverse proxy) olarak iletir. Frontend ile backend tarayıcı
açısından aynı origin'de olduğu için CORS hiç devreye girmez ve refresh token'ın
httpOnly cookie'si (K-18) sorunsuz çalışır.

Her parça tek başına da çalıştırılabilir (`cd web && docker compose up` gibi); web
konteyneri backend kapalıyken de açılır, arayüz "sistem geçici olarak bakımda"
uyarısını gösterir.

## Özellikler

| Modül             | Açıklama                                                   | Durum    |
| ----------------- | ---------------------------------------------------------- | -------- |
| Kimlik Doğrulama  | Kayıt, giriş, JWT + refresh token (httpOnly cookie)        | ✅       |
| Tesis Yönetimi    | Kayıt, doğrulama, belge yükleme, profil                    | ✅       |
| Malzeme Yönetimi  | Çıktı/girdi CRUD, AI sınıflandırma, embedding              | ✅       |
| Eşleştirme        | pgvector benzerlik araması, 5 faktörlü skorlama            | ✅       |
| DPP               | Dijital Ürün Pasaportu (JSON + PDF + QR), ESPR uyumu       | ✅       |
| CBAM Raporları    | Karbon tasarrufu hesabı, çevresel etki raporu              | ✅       |
| Bildirimler       | Gerçek zamanlı WebSocket + bildirim geçmişi                | ✅       |
| Admin Paneli      | Tesis doğrulama, kullanıcı yönetimi, AHP ağırlıkları       | ✅       |
| OSB Dashboard     | Bölge istatistikleri, harita, aylık rapor                  | ✅       |
| HITL Uzman Paneli | Düşük güvenli sınıflandırma inceleme kuyruğu               | ✅       |
| AI Eşleştirme     | SBERT fine-tuned model + BM25 hibrit arama                 | ✅       |
| AI Sınıflandırma  | 7 kategori, prototip tabanlı, F1=0.883                     | ✅       |
| Chatbot           | Anahtar kelime tabanlı yardım (Claude API altyapısı hazır) | ⚠️ Dummy |
| IoT Entegrasyonu  | API key tabanlı stok güncelleme                            | ✅       |
| Cron              | Süresi dolan eşleşmelerin otomatik kapatılması             | ✅       |

## Dokümantasyon

Tüm teknik dokümantasyonlar [`docs/`](docs/README.md) altında.

| Doküman                                                                          | İçerik                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------- |
| [01 · Proje Genel Bakış](docs/01-proje-genel-bakis.md)                           | Problem, çözüm, aktörler, personalar, sözlük  |
| [02 · Mimari](docs/02-mimari.md)                                                 | Servis topolojisi, katmanlar, veri akışı      |
| [03 · Veri Modeli](docs/03-veri-modeli.md)                                       | Şema, enum'lar, indeksler, migration sırası   |
| [04 · API Sözleşmesi](docs/04-api-sozlesmesi.md)                                 | Endpoint'ler, hata formatı, rate limit        |
| [05 · İş Kuralları](docs/05-is-kurallari.md)                                     | Skorlama, CBAM, DPP, durum makinesi           |
| [06 · Senaryolar](docs/06-senaryolar.md)                                         | Kabul kriterleri, edge case'ler, test matrisi |
| [07 · AI Entegrasyonu](docs/07-ai-entegrasyonu.md)                               | AI servis sınırı ve sözleşmesi                |
| [08 · Yol Haritası](docs/08-yol-haritasi.md)                                     | Fazlar, görevler, çıkış kriterleri            |
| [09 · Kararlar](docs/09-kararlar.md)                                             | Mimari karar kayıtları                        |
| [10 · Geliştirme Rehberi](docs/10-gelistirme-rehberi.md)                         | Kurulum, standartlar, test, PR                |
| [11 · Demo Veri Seti](docs/11-demo-veri-seti.md)                                 | Giriş bilgileri, seed senaryoları             |
| [12 · Kurulum Kılavuzu](docs/12-kurulum-kilavuzu.md)                             | Madde 10.3 (2 & 8): Jüri için tek komutla kurulum rehberi     |
| [13 · Kullanıcı Kılavuzu](docs/13-kullanici-kilavuzu.md)                         | Madde 10.3 (3): Rol bazlı görsel son kullanıcı el kitabı      |
| [14 · Kütüphane ve Lisanslar](docs/14-kutuphane-ve-lisanslar.md)                 | Madde 10.3 (6) & 10.4: Bağımlılık listesi + lisans uyumu      |
| [15 · Yapay Zekâ Beyanı](docs/15-yapay-zeka-beyani.md)                           | Madde 10.5: YZ araçları, veri sınırı, yanlılık analizi        |
| [16 · Çevresel Etki Metodolojisi](docs/16-cevresel-etki-metodolojisi.md)         | Madde 10.9: CO2/CBAM hesaplama, emisyon faktörleri            |
| [17 · Veri Güvenliği ve Silme Beyanı](docs/17-veri-guvenligi-ve-silme-beyani.md) | Madde 10.6: KVKK, 15 günlük veri imha taahhüdü                |
| [18 · Demo Videosu Senaryosu](docs/18-demo-videosu-senaryosu.md)                 | Madde 10.3 (7): 5 dakikalık jüri video çekim planı ve metni   |
| [19 · Teknik Mimari Raporu](docs/teknik-mimari-raporu.md)                        | Madde 10.3 (4): 6 zorunlu başlığı birleştiren tek PDF raporu  |

## Yapı

```
backend/            NestJS 10 + Fastify + Prisma 5 + PostgreSQL 16
web/                Next.js 16 (statik export) + nginx — arayüz ve API vekili
AI Microservice/    Python 3.12 + FastAPI + SBERT — AI eşleştirme ve sınıflandırma
docs/               Teknik dokümantasyon
docker-compose.yml  Tüm servisleri tek komutla ayağa kaldırır
LICENSE             MIT lisansı
```

## AI Mikroservisi Performansı

212 eşleştirme çifti ve 140 sınıflandırma örneği üzerinde ölçülmüştür.

| Metrik                            | Değer     |
| --------------------------------- | --------- |
| Eşleştirme F1 (optimal eşik 0.49) | **0.883** |
| Yanlış pozitif oranı              | **%5.9**  |
| Sınıflandırma doğruluğu           | **%76.4** |
| Pozitif-negatif ayrımı            | **0.675** |

Modelin v1'den v9'a gelişim süreci: [`AI Microservice/GELISTIRME-RAPORU.md`](AI%20Microservice/GELISTIRME-RAPORU.md)

## Lisans

MIT — bkz. [LICENSE](LICENSE)

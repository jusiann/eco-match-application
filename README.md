# EcoMatch

Organize Sanayi Bölgelerinde endüstriyel simbiyozu otomatikleştiren AI destekli platform.
Bir tesisin atığı, başka bir tesisin hammaddesi — EcoMatch bu eşleşmeyi bulur, skorlar ve
gerekli uyum belgelerini (DPP, CBAM) üretir.

**TEKNOFEST 2026** · Sıfır Atık & Döngüsel Ekonomi Yarışması · Tema: 3.2 Endüstriyel Atık Yönetimi ve Yeniden Kullanım  
**Takım Adı:** VectorMatch · **Takım ID:** #1003771

---

## 🏆 TEKNOFEST 2026 Teknik Doğrulama Teslim Belgeleri

Şartname (Madde 10.3 – 10.9) ve KYS Teknik Doğrulama portalı gereksinimleri doğrultusunda hazırlanan resmi dokümanlar aşağıda sunulmuştur:

> [!IMPORTANT]
> **KYS Formuna Yüklenecek Ana Teknik Çizim Belgesi:**  
> 👉 [**EcoMatch_Prototip_Teknik_Cizim_ve_Sistem_Mimarisi.pdf**](docs/pdf/EcoMatch_Prototip_Teknik_Cizim_ve_Sistem_Mimarisi.pdf) *(Sistem Mimarisi, Konteyner Topolojisi, Simbiyoz Süreç Akışı, ER Veritabanı Şeması ve Kamu Entegrasyon Haritası)*  
> 
> **Tüm Şartname Raporlarını Birleştiren Tek Cilt Master Rapor:**  
> 👉 [**EcoMatch_TEKNOFEST_2026_Teknik_Dogrulama_Master_Raporu.pdf**](docs/pdf/EcoMatch_TEKNOFEST_2026_Teknik_Dogrulama_Master_Raporu.pdf) *(6 MB - 10 Bölüm Eksiksiz Cilt)*

### Şartname Maddeleri ve İlgili Teslim Belgeleri Matrisi

| # | Şartname Maddesi / Başlığı | Açıklama | Markdown | Resmi PDF |
|---|---|---|:---:|:---:|
| **—** | **KYS Form Çizim Alanı** | Prototip Teknik Çizim ve Sistem Mimarisi | [docs/teknik-mimari-raporu.md](docs/teknik-mimari-raporu.md) | [**İndir (PDF)**](docs/pdf/EcoMatch_Prototip_Teknik_Cizim_ve_Sistem_Mimarisi.pdf) |
| **01** | **Madde 10.3 (2 & 8)** | Kurulum Dokümanı & Çalıştırılabilir Paket | [docs/12-kurulum-kilavuzu.md](docs/12-kurulum-kilavuzu.md) | [**İndir (PDF)**](docs/pdf/01_Madde_10_3_Kurulum_Dokumani.pdf) |
| **02** | **Madde 10.3 (3)** | Kullanıcı Kılavuzu (4 Rol İçin Uygulama Rehberi) | [docs/13-kullanici-kilavuzu.md](docs/13-kullanici-kilavuzu.md) | [**İndir (PDF)**](docs/pdf/02_Madde_10_3_Kullanici_Kilavuzu.pdf) |
| **03** | **Madde 10.3 (4) & 10.8** | Teknik Mimari, API Sözleşmesi & Entegrasyon | [docs/teknik-mimari-raporu.md](docs/teknik-mimari-raporu.md) | [**İndir (PDF)**](docs/pdf/03_Madde_10_3_ve_10_8_Teknik_Mimari_Raporu.pdf) |
| **04** | **Madde 10.3 (5)** | Veri Modeli ve Veritabanı Tasarım Açıklaması | [docs/03-veri-modeli.md](docs/03-veri-modeli.md) | [**İndir (PDF)**](docs/pdf/04_Madde_10_3_Veri_Modeli_Aciklamasi.pdf) |
| **05** | **Madde 10.3 (6) & 10.4** | Kütüphane, Bağımlılık ve Lisans Uygunluk Beyanı | [docs/14-kutuphane-ve-lisanslar.md](docs/14-kutuphane-ve-lisanslar.md) | [**İndir (PDF)**](docs/pdf/05_Madde_10_4_Acik_Kaynak_ve_Lisans_Uygunluk_Beyani.pdf) |
| **06** | **Madde 10.5** | Yapay Zekâ Kullanımı & Veri Sınırı Güvencesi | [docs/15-yapay-zeka-beyani.md](docs/15-yapay-zeka-beyani.md) | [**İndir (PDF)**](docs/pdf/06_Madde_10_5_Yapay_Zeka_Kullanim_Beyani.pdf) |
| **07** | **Madde 10.6 & 10.7** | Veri Güvenliği, KVKK ve Veri Silme Taahhütnamesi | [docs/17-veri-guvenligi-ve-silme-beyani.md](docs/17-veri-guvenligi-ve-silme-beyani.md) | [**İndir (PDF)**](docs/pdf/07_Madde_10_6_ve_10_7_Veri_Guvenligi_Silme_ve_KVKK_Beyani.pdf) |
| **08** | **Madde 10.9** | Çevresel Etki Metodolojisi & LCA Göstergeleri | [docs/16-cevresel-etki-metodolojisi.md](docs/16-cevresel-etki-metodolojisi.md) | [**İndir (PDF)**](docs/pdf/08_Madde_10_9_Cevresel_Etki_ve_Dogrulama_Metodolojisi.pdf) |
| **09** | **Madde 10.3 (7)** | Demo Videosu Senaryosu & Sunum Bilgi Notu | [docs/18-demo-videosu-senaryosu.md](docs/18-demo-videosu-senaryosu.md) | [**İndir (PDF)**](docs/pdf/09_Madde_10_3_Demo_Videosu_ve_Sunum_Bilgi_Notu.pdf) |

---

## Jüri İçin Hızlı Başlangıç (Tek Tıkla Çalıştırma)

Jüri heyetinin sistemi kendi bağımsız ortamında sıfır konfigürasyon ile çalıştırması için:

- **Windows:** Proje kök dizinindeki [`start.bat`](start.bat) dosyasına çift tıklayın. Docker servisleri otomatik ayağa kalkacak ve tarayıcınızda açılacaktır.
- **Linux / macOS:** Proje kök dizininde `./start.sh` komutunu çalıştırın.
- **Manuel Docker Komutu:**
  ```bash
  git clone https://github.com/jusiann/eco-match-application.git
  cd eco-match-application
  docker compose up --build
  ```

**Uygulama Giriş Adresi:** `http://localhost:8080` (Jüri ve kullanıcı için tek giriş noktası)  
**Tüm Demo Hesaplar Evrensel Şifresi:** `Ecomatch2026!`  
*(Hazır roller ve test hesapları için bkz: [docs/11-demo-veri-seti.md](docs/11-demo-veri-seti.md))*

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

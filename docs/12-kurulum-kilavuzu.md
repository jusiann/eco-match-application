# Bölüm 12: Kurulum Kılavuzu ve Çalıştırılabilir Paket Rehberi

> **Belge No:** EM-INS-2026-V1  
> **Yarışma:** TEKNOFEST 2026 — Sıfır Atık ve Döngüsel Ekonomi  
> **Takım:** VectorMatch (#1003771)  
> **İlgili Şartname Maddeleri:** Madde 10.3 (Başlık 2: Kurulum Dokümanı) ve Madde 10.3 (Başlık 8: Çalıştırılabilir Paket)  
> **Hedef Kitle:** Bağımsız Değerlendirme Jüri Heyeti ve Saha Mühendisleri

---

## 1. Genel Bakış ve Mimari Hazırlık

EcoMatch platformu; modern mikroservis mimarisi standartlarında geliştirilmiş olup, tüm bileşenleri (Veritabanı, Yapay Zekâ Mikroservisi, Backend API, Web Arayüzü ve Nginx Ters Vekil) monorepo kök dizinindeki tek bir `docker-compose.yml` orkestrasyonu ile yönetilmektedir.

Jüri üyelerinin sistemi kendi bağımsız ortamlarında çalıştırması için **hiçbir harici bağımlılık, yerel derleyici veya paket yöneticisi kurmasına gerek yoktur**. Yalnızca Docker ortamının kurulu olması yeterlidir.

---

## 2. Sistem Gereksinimleri

| Donanım / Yazılım | Asgari Gereksinim | Önerilen Yapılandırma | Notlar |
|---|---|---|---|
| **İşletim Sistemi** | Windows 10/11, macOS 12+, Ubuntu 22.04+ | Herhangi bir 64-bit OS | Docker çalıştıran tüm platformlar |
| **Konteyner Motoru** | Docker Desktop veya Docker Engine + Compose v2 | Docker Compose v2.20+ | Docker v2 `include` desteği gereklidir |
| **Bellek (RAM)** | 8 GB RAM | 16 GB RAM | SBERT YZ modeli bellek yoğundur (~840 MB) |
| **Disk Alanı** | 15 GB boş disk alanı | 25 GB SSD | İmajlar, YZ modelleri ve demo veritabanı |
| **İnternet** | Genişbant internet bağlantısı | 50+ Mbps | İlk çalıştırmada temel modelin indirilmesi için (~5 dk) |

---

## 3. Tek Komutla Hızlı Kurulum

Terminalinizi (PowerShell, Bash veya Zsh) açın ve aşağıdaki adımları sırasıyla çalıştırın:

```bash
# 1. Kaynak kod deposunu klonlayın
git clone <repo-url>
cd eco-match-application

# 2. Tüm mikroservisleri derleyin ve tek komutta ayağa kaldırın
docker compose up --build
```

> [!NOTE]
> **İlk Çalıştırma Notu:**
> - İlk başlatmada sınıflandırma modeli (`paraphrase-multilingual-mpnet-base-v2`) HuggingFace önbelleğine indirilir (~1.1GB, birkaç dakika sürebilir).
> - Eşleştirme modeli (`fine_tuned_model/`, 462 simbiyoz çiftiyle eğitilmiştir) **repoda tutulmaz** (~420MB, bilinçli tasarım tercihi). `ai-service` konteyneri açılışta bu klasörü kontrol eder: yoksa `fine_tune.py`'yi otomatik çalıştırıp **~5 dakikada** üretir; hata olursa konteyner durur (sessizce farklı bir modele düşülmez). Model host'taki `AI Microservice/fine_tuned_model/` altına yazıldığından **sonraki her `docker compose up` çağrısında bu adım atlanır** ve servis birkaç saniyede hazır olur. İlerlemeyi `docker compose logs -f ai-service` ile izleyebilirsiniz.
> - Demo veritabanı (`013_demo_seed_data.sql`), veritabanı konteyneri ilk kez açıldığında 14 kullanıcı, 13 tesis, 5 OSB ve tüm eşleşme durumlarıyla **otomatik olarak yüklenir**.

---

## 4. Konteyner Topolojisi ve Port Haritası

`docker compose up --build` komutu verildiğinde aşağıdaki 5 servis tek bir yalıtılmış ağda (`eco-match`) çalışmaya başlar:

| Konteyner Adı | Servis Görevi | Konteyner İçi Port | Ana Makine (Host) Portu | Sağlık Kontrolü (Healthcheck) |
|---|---|:---:|:---:|---|
| `eco-match-web` | Next.js 16 SPA + Nginx Ters Vekil | `80` | **`8080`** | `wget http://localhost/` |
| `eco-match-backend` | NestJS 10 + Fastify API Sunucusu | `3000` | **`3001`** | `GET /health` |
| `eco-match-ai` | Python 3.12 FastAPI SBERT YZ Servisi | `8000` | **`8000`** | `GET /health` |
| `eco-match-db` | PostgreSQL 16 + pgvector + PostGIS | `5432` | **`5434`** | `pg_isready -d eco_match` |
| `ecomatch_pgvector` | AI Mikroservisi pgvector Veritabanı | `5432` | **`5433`** | `pg_isready -d ecomatch` |

---

## 5. Sisteme Erişim ve Doğrulama

### 5.1. Ana Erişim Noktaları

| Erişim Adresi | Açıklama |
|---|---|
| **`http://localhost:8080`** | **Web Kullanıcı Arayüzü** — Kullanıcı ve jüri için **TEK VE YETERLİ ADRES**. Nginx, `/v1` ve `/socket.io` çağrılarını şeffaf şekilde backend'e iletir. |
| **`http://localhost:8080/api/docs`** | **Swagger / OpenAPI Sözleşmesi** (Ters vekil üzerinden interaktif API test ekranı). |
| `http://localhost:3001` | Backend API (Geliştirici veya cURL doğrudan testleri için). |
| `http://localhost:8000/docs` | AI Mikroservisi doğrudan FastAPI Swagger arayüzü. |

### 5.2. Hızlı Sağlık Kontrolü Komutları
Ayrı bir terminal penceresinde servislerin durumunu doğrulamak için:

```bash
# 1. Konteyner durumlarını listeleyin (hepsi 'Up' veya 'healthy' olmalıdır)
docker compose ps

# 2. Backend sağlık durumunu sorgulayın (HTTP 200 döner)
curl -i http://localhost:8080/health

# 3. AI mikroservisi sağlık durumunu sorgulayın
curl -i http://localhost:8000/health
```

---

## 6. Hazır Jüri Demo Hesapları

Veritabanı otomatik olarak tohumlanmıştır (seeded). Tüm hesaplar aynı şifreyi kullanır:

> **Evrensel Demo Şifresi:** `Ecomatch2026!`

| E-posta | Rol | Tesis / Kurum | Jüri İnceleme Senaryosu |
|---|---|---|---|
| `aylin@dokutekstil.com.tr` | **Tesis Yetkilisi** | Doku Tekstil A.Ş. | Çıktı ekleme, anında AI sınıflandırması, 5 faktörlü eşleşme bulma. |
| `ali@yapigrup.com.tr` | **Tesis Yetkilisi** | Uludağ Yapı ve Çimento | Karşı teklifi inceleme, eşleşmeyi kabul etme, DPP/QR doğrulama. |
| `mehmet@bursaniluferosb.gov.tr` | **OSB Yöneticisi** | Bursa Nilüfer OSB | Bölgesel dashboard, Leaflet haritası üzerinde akışlar, PDF rapor indirme. |
| `kaan@ecomatch.app` | **HITL Uzmanı** | Çevre ve Malzeme Uzmanı | Düşük güvenli (<%80) atık inceleme kuyruğu, onay/red işlemi. |
| `ayse@ecomatch.app` | **Sistem Admini** | Platform Operatörü | Yeni tesis onaylama, AHP skor ağırlıkları kalibrasyonu, IoT API key. |

Ayrıntılı test matrisi ve senaryo adımları için [11-demo-veri-seti.md](./11-demo-veri-seti.md) kılavuzuna başvurabilirsiniz.

---

## 7. Sistemi Durdurma ve Sıfırlama

### 7.1. Geçici Durdurma
```bash
docker compose down
```

### 7.2. Sıfırdan Temiz Kurulum (Tüm Verileri Temizleme)
Jüri değerlendirmesi sonrasında veya testleri sıfırdan tekrarlamak istediğinizde veritabanı disk birimlerini (`volumes`) temizlemek için:

```bash
docker compose down -v
docker compose up --build
```

---

## 8. Sık Karşılaşılan Durumlar ve Sorun Giderme

| Belirti | Olası Neden | Çözüm |
|---|---|---|
| **Port Çakışması (8080 veya 3001 dolu)** | Ana makinenizde başka bir web sunucusu (IIS, Apache vb.) çalışıyor olabilir. | Çakışan servisi durdurun veya `web/docker-compose.yml` içindeki `8080:80` port eşlemesini boş bir porta (örn. `8085:80`) çekin. |
| **AI Servisi İlk Açılışta 'unhealthy'** | İlk çalıştırmada hem HuggingFace model indirmesi hem de `fine_tuned_model/` eğitimi (~5 dk) sürüyor olabilir. | `docker logs eco-match-ai -f` komutuyla ilerlemeyi izleyin. Healthcheck ilk 10 dakika içindeki başarısızlıkları zaten "unhealthy" saymaz (`start_period`); eğitim/indirme bitince servis otomatik `healthy` olur. |
| **"Cannot connect to the Docker daemon"** | Docker Desktop kapalıdır. | Docker Desktop uygulamasını başlatın ve durumunun "Engine Running" olduğunu teyit edin. |
| **Bellek Yetersizliği Hatası (OOM)** | Docker'a ayrılan RAM miktarı 8 GB'ın altındadır. | Docker Desktop Settings $\to$ Resources $\to$ Memory değerini en az 8 GB olarak güncelleyin. |

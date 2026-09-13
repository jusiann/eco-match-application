# Bölüm 14: Kütüphane, Bağımlılık ve Lisans Uygunluk Beyanı

> **Belge No:** EM-LIC-2026-V1  
> **Yarışma:** TEKNOFEST 2026 — Sıfır Atık ve Döngüsel Ekonomi  
> **Takım:** VectorMatch (#1003771)  
> **İlgili Şartname Maddeleri:** Madde 10.3 (Başlık 6: Kütüphane ve Lisans Listesi) ve Madde 10.4 (Lisans Uygunluğu Beyanı)  
> **Kapsam:** Repodaki tüm açık kaynak kodlu bileşenler, kütüphaneler, YZ modelleri ve fikri mülkiyet uyumluluk analizi.

---

## 1. Proje Lisansı ve Telif Hakkı

EcoMatch platformunun tüm kaynak kodları, veri modelleri, konfigürasyon dosyaları ve mimari dokümantasyonu; açık kaynak topluluğunun en esnek ve yaygın lisanslarından biri olan **MIT Lisansı** altında sunulmaktadır (Bkz. kök dizindeki [LICENSE](../../LICENSE) dosyası).

---

## 2. Madde 10.4 Kapsamında Lisans Uyumluluk ve Bulaşma (Copyleft) Analizi

EcoMatch mimarisinde kullanılan tüm üçüncü taraf bağımlılıklar, açık kaynak lisanslama standartları ve FSF (Free Software Foundation) / OSI (Open Source Initiative) ilkeleri doğrultusunda kapsamlı bir hukuki-teknik analize tabi tutulmuştur:

### 2.1. İzin Verici (Permissive) Lisanslar (MIT, Apache-2.0, BSD, ISC)
- Projemizdeki bağımlılıkların %95'ten fazlası **MIT, Apache-2.0 veya BSD** lisanslıdır.
- Bu lisanslar ticari kullanım, değiştirme, dağıtım ve alt lisanslama haklarını serbestçe tanır; kaynak kodun açılmasını zorunlu kılan copyleft kısıtlaması getirmez.
- Apache-2.0 lisanslı bileşenler (örn. `sentence-transformers`, `Prisma`, `RxJS`), MIT lisansı altındaki EcoMatch ana kodu ile tam uyumludur. Gerekli atıf ve bildirimler kök dizindeki [NOTICE](../../NOTICE) dosyasında sağlanmıştır.

### 2.2. PostGIS (GPL-2.0) ve Mimari İzolasyon Analizi
Projede coğrafi koordinat mesafe hesaplamaları (`ST_Distance`) için **PostGIS** veritabanı eklentisi kullanılmaktadır. PostGIS, **GNU GPL-2.0** lisansına sahiptir. GPL lisanslarının güçlü copyleft (kod bulaşması) etkisi projemiz açısından aşağıdaki teknik-mimari gerekçelerle **herhangi bir bulaşma veya ihlal riski oluşturmamaktadır**:

1. **Ayrı Süreç ve Konteyner İzolasyonu:** PostGIS, uygulamanın (backend) bir parçası olarak derlenmemiştir; PostgreSQL veritabanı sunucusu içinde dinamik eklenti olarak ayrı bir işletim sistemi sürecinde (ayrı bir Docker konteynerinde) çalışır.
2. **Standart Ağ Protokolü ile İletişim (IPC via TCP/IP):** EcoMatch backend'i (`NestJS`), PostgreSQL/PostGIS sunucusuyla yalnızca standart PostgreSQL ağ protokolü (TCP/IP soketi üzerinden SQL sorguları) aracılığıyla haberleşir.
3. **FSF Emsal Kuralı:** Özgür Yazılım Vakfı (FSF) GPL SSS (FAQ) ilkelerine ve yerleşik açık kaynak hukuku içtihatlarına göre; *"Bir program ile GPL lisanslı bir veritabanı/servis arasında yalnızca standart SQL ve ağ tabanlı soket iletişimi bulunması durumunda, çağıran program GPL'in türetilmiş eseri (derivative work) sayılamaz."*
4. **Sonuç:** GPL-2.0 şartları yalnızca PostGIS'in kendi kaynak kodları ve ikili dosyaları ile sınırlı kalır; EcoMatch backend, frontend veya AI mikroservis kaynak kodlarına kesinlikle sirayet etmez.

### 2.3. psycopg2-binary (LGPL-2.1) Analizi
- Python AI mikroservisinde PostgreSQL bağlantısı için kullanılan `psycopg2-binary`, **GNU LGPL-2.1** lisansına sahiptir.
- LGPL-2.1 Madde 6 uyarınca; kütüphanenin dinamik olarak bağlanması (shared library / pip precompiled wheel) durumunda, bu kütüphaneyi çağıran uygulamanın kaynak kodunun LGPL olma veya açılma zorunluluğu bulunmamaktadır. Dolayısıyla MIT uyumu korunmaktadır.

---

## 3. Ayrıntılı Kütüphane ve Bağımlılık Envanteri

### 3.1. Backend Katmanı (`backend/package.json`)

**Üretim (Production) Bağımlılıkları:**
| Paket Adı | Sürüm | Lisans | Kullanım Amacı |
|---|---|---|---|
| `@nestjs/core`, `@nestjs/common` | ^10.0.0 | MIT | Sunucu uygulama çatısı çekirdeği |
| `@nestjs/platform-fastify` | ^10.0.0 | MIT | Yüksek performanslı HTTP motoru |
| `@nestjs/config` | ^4.0.4 | MIT | Çevre değişkenleri yönetimi (.env) |
| `@nestjs/jwt` | ^10.2.0 | MIT | JWT tabanlı kimlik doğrulama |
| `@nestjs/swagger` | ^7.4.2 | MIT | OpenAPI / Swagger dokümantasyon üretimi |
| `@nestjs/throttler` | ^5.2.0 | MIT | Rate limit (istek sınırlama) güvenliği |
| `@nestjs/schedule` | ^4.1.2 | MIT | Zamanlanmış görevler (cron - süresi dolan eşleşmeler) |
| `@nestjs/websockets`, `@nestjs/platform-socket.io` | ^10.4.22 | MIT | Gerçek zamanlı bildirim altyapısı |
| `@prisma/client` | ^5.10.0 | Apache-2.0 | Veritabanı ORM ve sorgu motoru |
| `@fastify/cookie` | ^9.4.0 | MIT | Güvenli httpOnly refresh token çerez yönetimi |
| `@fastify/multipart` | ^8.3.1 | MIT | Tesis onay belgeleri dosya yükleme |
| `@fastify/static` | ^7.0.4 | MIT | Statik dosya sunumu |
| `bcrypt` | ^5.1.1 | MIT | Parola hash'leme ve tuzlama (salt) |
| `class-transformer`, `class-validator` | ^0.5.1 / ^0.14.1 | MIT | DTO doğrulama ve veri dönüşümü |
| `exceljs` | ^4.4.0 | MIT | OSB aylık raporlarının XLSX çıktısı |
| `js-yaml` | ^4.1.1 | MIT | YAML OpenAPI sözleşme dosyalarını okuma |
| `pdfkit` | ^0.20.1 | MIT | Dijital Ürün Pasaportu (DPP) ve CBAM PDF üretimi |
| `qrcode` | ^1.5.4 | MIT | DPP fiziksel etiket QR kod vektör üretimi |
| `reflect-metadata` | ^0.2.0 | Apache-2.0 | TypeScript anotasyon çalışma zamanı |
| `rxjs` | ^7.8.1 | Apache-2.0 | Reaktif veri akışları |
| `socket.io` | ^4.8.3 | MIT | WebSocket sunucu protokolü |

**Geliştirme ve Test Bağımlılıkları:**
| Paket Adı | Sürüm | Lisans | Kullanım Amacı |
|---|---|---|---|
| `typescript` | ^5.1.3 | Apache-2.0 | Statik tipli derleyici |
| `prisma` | ^5.10.0 | Apache-2.0 | Veritabanı şema ve migrasyon CLI |
| `@nestjs/cli`, `@nestjs/schematics` | ^10.0.0 | MIT | Kod üretim ve geliştirme araçları |
| `@nestjs/testing` | ^10.0.0 | MIT | Entegrasyon ve birim test altyapısı |
| `ts-node` | ^10.9.1 | MIT | TypeScript çalışma zamanı çalıştırıcısı |
| `socket.io-client` | ^4.8.3 | MIT | WebSocket e2e test istemcisi |

---

### 3.2. Web Katmanı (`web/package.json`)

| Paket Adı | Sürüm | Lisans | Kullanım Amacı |
|---|---|---|---|
| `next` | 16.2.6 | MIT | React tabanlı web çerçevesi (SPA statik export) |
| `react`, `react-dom` | 19.2.4 | MIT | Kullanıcı arayüzü kütüphanesi |
| `leaflet` | ^1.9.4 | BSD-2-Clause | OSB ve tesis konumları interaktif harita motoru |
| `socket.io-client` | ^4.8.3 | MIT | Gerçek zamanlı WebSocket istemcisi |
| `tailwindcss`, `@tailwindcss/postcss` | ^4.0.0 | MIT | Modern arayüz tasarım sistemi ve CSS yardımcıları |
| `eslint`, `eslint-config-next` | ^9.0.0 / 16.2.6 | MIT | Kod kalitesi ve statik analiz denetçisi |
| `typescript` | ^5.0.0 | Apache-2.0 | Frontend tip güvenliği |

---

### 3.3. Yapay Zekâ Mikroservisi (`AI Microservice/requirements.txt`)

| Paket Adı | Sürüm | Lisans | Kullanım Amacı |
|---|---|---|---|
| `fastapi` | 0.115.0 | MIT | Yüksek performanslı asenkron REST API framework |
| `uvicorn[standard]` | 0.30.6 | BSD-3-Clause | ASGI sunucu çalışma zamanı |
| `pydantic`, `pydantic-settings` | 2.9.0 / 2.5.0 | MIT | İstek doğrulama ve konfigürasyon şemaları |
| `sentence-transformers` | 3.1.0 | Apache-2.0 | SBERT embedding ve benzerlik hesaplama kütüphanesi |
| `psycopg2-binary` | 2.9.9 | LGPL-2.1 | PostgreSQL C-bağlantı sürücüsü (dinamik bağlantı) |
| `numpy` | >=1.26.0 | BSD-3-Clause | Sayısal matris ve vektör işlemleri |
| `matplotlib`, `seaborn` | >=3.8.0 / >=0.13.0 | PSF / BSD-3-Clause | Test ve doğrulama grafikleri üretimi |
| `rank-bm25` | 0.2.2 | Apache-2.0 | Hibrit arama için BM25 anahtar kelime algoritması |
| `requests` | >=2.31.0 | Apache-2.0 | Test ve veri aktarım HTTP istemcisi |
| `torch` (CPU Sürümü) | >=2.2.0 | BSD-3-Clause | Derin öğrenme tensör hesaplama kütüphanesi |

---

### 3.4. Önceden Eğitilmiş YZ Modelleri

| Model Adı | Sağlayıcı / Kaynak | Lisans | Kullanım Şekli |
|---|---|---|---|
| `sentence-transformers/all-mpnet-base-v2` | Hugging Face / Microsoft | Apache-2.0 | 768 boyutlu anlamsal metin vektörleştirme; yerel model diskten okunur. |
| `fine_tuned_model/` | VectorMatch Takımı | MIT | `all-mpnet-base-v2` temel alınarak 462 simbiyoz çiftiyle eğitilmiş takım modelimiz. |

---

### 3.5. Altyapı ve Sunucu Bileşenleri

| Bileşen | Sürüm | Lisans | Rol ve İzolasyon |
|---|---|---|---|
| **PostgreSQL** | 16 | PostgreSQL (BSD-like) | Ana ilişkisel veritabanı sunucusu |
| **pgvector** | v0.7+ | PostgreSQL (BSD-like) | HNSW vektör benzerlik arama eklentisi |
| **PostGIS** | 3.4 | GPL-2.0 | Coğrafi mesafe hesaplama (ayrı DB sürecinde) |
| **Nginx** | 1.27 (Alpine) | BSD-2-Clause | Ters vekil, SSL sonlandırma ve statik dosya sunucusu |
| **Docker Engine** | 24+ | Apache-2.0 | Konteynerizasyon platformu |
| **Node.js** | 20 LTS | MIT | Backend çalışma zamanı |
| **Python** | 3.12 | PSF License | AI mikroservisi çalışma zamanı |

---

## 4. Takım Lisans Uygunluk Beyanı

> **Telif ve Yasal Uygunluk Taahhüdü:**  
> VectorMatch Takımı (#1003771) olarak; EcoMatch projesinde kullanılan tüm üçüncü taraf yazılımların, kütüphanelerin, modellerin ve araçların açık kaynak lisans şartlarına harfiyen uyulduğunu, fikri mülkiyet haklarını ihlal eden hiçbir korsan veya izinsiz kod/veri parçası kullanılmadığını, copyleft (GPL) niteliğindeki PostGIS bileşeninin mimari olarak izole edildiğini ve projenin MIT lisansı altında özgürce kullanıma ve jüri değerlendirmesine hazır olduğunu beyan ederiz.
>
> **Takım Kaptanı:** VectorMatch Ekip Temsilcisi  
> **Tarih:** 2026  

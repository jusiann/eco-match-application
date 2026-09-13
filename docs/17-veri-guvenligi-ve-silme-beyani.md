# Bölüm 17: Veri Güvenliği ve Veri Silme Taahhütnamesi

> **Belge No:** EM-SEC-2026-V1  
> **Yarışma:** TEKNOFEST 2026 — Sıfır Atık ve Döngüsel Ekonomi  
> **Takım:** VectorMatch (#1003771)  
> **İlgili Şartname Maddesi:** Madde 10.6 (Veri Güvenliği ve Silme Beyanı)  
> **Kapsam:** Veri gizliliği, KVKK uyumluluğu, teknik güvenlik önlemleri ve yarışma sonrası veri imha taahhüdü.

---

## 1. Veri Güvenliği ve Gizlilik İlkeleri

EcoMatch platformu; endüstriyel tesislerin ticari sırlarını, üretim reçetelerini ve kişisel verileri en üst düzeyde korumak üzere **Gizlilik Odaklı Tasarım (Privacy by Design)** prensipleriyle geliştirilmiştir:

1. **Kişisel Verilerin Korunması (KVKK):**
   - Platform yalnızca hizmetin sunulabilmesi için asgari düzeyde kişisel veri (ad-soyad, e-posta, unvan) işler.
   - 6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca, kullanıcılar istedikleri zaman sistemdeki verilerini görüntüleme, güncelleme ve silme hakkına sahiptir (`DELETE /v1/auth/me`).
2. **Ticari Sır ve Sanayi Verisi Maskeleme:**
   - Eşleştirme arayüzünde, taraflar teklifi karşılıklı olarak kabul edene kadar tesis isimleri ve iletişim bilgileri gizli tutulur (*"Kocaeli Dilovası OSB'de bir metal işletmesi"* şeklinde anonimleştirilir).
   - Tesis yetkililerinin telefon, e-posta ve doğrudan adres bilgileri yalnızca her iki taraf da **"Kabul Et"** butonuna bastığında eşzamanlı olarak açılır.
3. **Sıfır Dış Veri Transferi Güvencesi (Madde 10.5 Uyumu):**
   - Sistemde çalışan SBERT yapay zekâ modeli ve veritabanı tamamen yalıtılmış yerel Docker ağında çalışır.
   - Hiçbir tesis verisi, atık miktarı veya Bakanlık bilgisi üçüncü taraf bulut servislerine veya yapay zekâ API'lerine aktarılmaz.

---

## 2. Teknik Güvenlik Önlemleri

Platform mimarisinde uygulanan sektör standardı teknik tedbirler:

- **Oturum Güvenliği:** 1 saat geçerli JWT access token ve 30 gün geçerli `httpOnly; SameSite=Strict; Secure` çerezlerde saklanan rotasyonlu refresh token mimarisi (XSS korumalı).
- **Parola Güvenliği:** Parolalar en az 10 tuzlama turu (`salt round`) ile tek yönlü **bcrypt** algoritmasıyla şifrelenir.
- **API Anahtarı Güvenliği:** IoT ve sensör entegrasyonu için üretilen API anahtarları veritabanında **SHA-256** özet fonksiyonu ile saklanır.
- **SQL Enjeksiyon Koruması:** Tüm veritabanı sorguları Prisma ORM ve parametreli SQL şablonları (`$queryRaw`) üzerinden yürütülür; ham string birleştirme kesinlikle yapılmaz.
- **Payload Koruması:** Gelen tüm HTTP istekleri `class-validator` ve `ValidationPipe` (`forbidNonWhitelisted: true`) ile denetlenir; tanımlı şema dışındaki beklenmeyen alanlar reddedilir.
- **Hız Sınırlama (Rate Limiting):** Brute-force ve DoS girişimlerine karşı NestJS `ThrottlerGuard` ile IP ve rota bazlı istek sınırlandırması uygulanır.
- **Denetim İzi (Audit Logging):** Sistemdeki her veri mutasyonu aktör ID, işlem tipi, IP ve zaman damgasıyla `audit_log` tablosuna yazılır.

---

## 3. Resmî Veri Silme ve İmha Taahhüdü (Madde 10.6)

Şartname Madde 10.6 hükümleri doğrultusunda, VectorMatch Takımı olarak aşağıdaki imha prosedürünü resmen taahhüt ederiz:

> ### VERİ İMHA TAAHHÜTNAMESİ
> 
> 1. **İmha Süresi:**  
>    TEKNOFEST 2026 Sıfır Atık ve Döngüsel Ekonomi yarışması değerlendirme süreci ve jüri incelemeleri tamamlandıktan sonra, platform üzerinde toplanan veya test amacıyla oluşturulan tüm kullanıcı, tesis, eşleşme, malzeme ve log verileri **en geç 15 (on beş) iş günü içerisinde** kalıcı olarak silinecek ve imha edilecektir.
> 
> 2. **İmha Edilecek Kapsam:**
>    - PostgreSQL veritabanlarındaki tüm operasyonel tablolar (`users`, `facilities`, `outputs`, `inputs`, `matches`, `audit_log` vb.).
>    - AI mikroservisi pgvector veritabanındaki prototip kayıtları ve vektör indeksleri.
>    - Sunucuda ve konteynerlerde depolanan tüm PDF raporları, DPP QR kod görselleri ve yüklenen tesis doğrulama belgeleri (`uploads/` dizini).
>    - İnsan denetimi (HITL) logları (`training/human_reviewed.jsonl`) ve sunucu erişim günlükleri.
> 
> 3. **Teknik İmha Yöntemi:**
>    - Docker konteyner ortamında `docker compose down -v` komutu çalıştırılarak tüm kalıcı disk birimleri (`volumes: ecomatch_pgdata, pgdata, hf_cache`) kriptografik olarak silinecektir.
>    - Kalıcı disk depolama alanları üzerine yazma (overwriting) yöntemiyle geri getirilemeyecek şekilde sıfırlanacaktır.
> 
> **Taahhüt Eden:** VectorMatch Takımı Temsilcisi  
> **Takım ID:** #1003771  
> **Tarih:** 2026  
> **İmza:** *[Yetkili Takım Kaptanı İmzası]*  

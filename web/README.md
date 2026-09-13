# EcoMatch Web Panel

EcoMatch, yapay zekâ destekli endüstriyel simbiyoz ve sürdürülebilirlik yönetim platformudur.
Bu panel, tesislerin atıklarını yönetmesini, eşleştirmeler bulmasını ve SKDM (CBAM) / Dijital
Ürün Pasaportu (DPP) raporlarını oluşturmasını sağlayan Next.js kontrol panelidir.

Uygulama tamamen istemci tarafında çalışan tek sayfalık bir SPA'dır (`next.config.ts` →
`output: "export"`). Çalışma zamanında Node sunucusuna ihtiyaç duymaz; üretimde statik
dosyaları nginx sunar.

---

## 1. Docker ile Çalıştırma (Önerilen)

Repo kökünden tek komutla tüm yığını ayağa kaldırabilirsiniz:

```bash
docker compose up --build
```

**Uygulama Adresi: http://localhost:8080**

Bu tek adres hem arayüzü hem API'yi sunar. `web` konteynerindeki nginx şu yolları backend'e
ters vekil (reverse proxy) olarak iletir:

| Yol | Hedef | Açıklama |
|---|---|---|
| `/v1/*` | REST API | Backend global prefix'i (`http://backend:3000`) |
| `/health`, `/health/ready` | Sağlık Uçları | Sistem sağlık kontrolleri |
| `/socket.io/*` | WebSocket | Canlı bildirim akışı (WebSocket yükseltmesiyle) |
| `/api/docs` | Swagger | OpenAPI dokümantasyon arayüzü |
| Diğer her şey | Statik SPA | Bilinmeyen tüm yollar `index.html`'e düşer |

### Neden Ters Vekil?
Frontend ve backend tarayıcı açısından **aynı origin'de** (`localhost:8080`) çalışır:
- **CORS Devre Dışı:** Preflight istekleri kalkar, origin listesi tutmaya gerek kalmaz.
- **Güvenli Çerezler (httpOnly):** Refresh token'ın httpOnly cookie'si (K-18, `path=/v1/auth`, `SameSite=Lax`) sorunsuz çalışır.
- **Port İzolasyonu:** Frontend imajı backend'in ana makine (host) portunu bilmek zorunda kalmaz.

### Backend Kapalıyken
Nginx, backend adresini konteyner ayağa kalkarken değil **istek geldiğinde** dinamik olarak çözer (`resolver 127.0.0.11`). Bu sayede backend kapalıyken de arayüz açılır; uygulama kendi `/health/ready` yoklamasıyla "sistem geçici olarak bakımda" uyarısını gösterir (H2). `cd web && docker compose up` tek başına da çalışabilir.

---

## 2. Yerel Geliştirme (`npm run dev`)

```bash
cd web
npm install
cp .env.example .env.local   # Backend adresini kendi ortamınıza göre düzenleyin
npm run dev -- -p 3002
```

`.env.local` içindeki `NEXT_PUBLIC_API_URL`, backend'i hangi adreste çalıştırdığınızla birebir eşleşmelidir:

| Backend Nasıl Çalışıyor | Değer |
|---|---|
| Docker'da (`docker compose up`) | `http://localhost:3001` |
| Yerelde `npm run dev` | `http://localhost:3000` (backend `.env` → `PORT`) |

*Değişken tanımlı değilse varsayılan `http://localhost:3001` kullanılır.*

Frontend'i backend ile **aynı portta çalıştırmayın** (3000/3001 doludur), yukarıdaki gibi `-p 3002` verin. Bu durumda CORS devreye girer; backend `credentials: true` ile yapılandırılmıştır ve gelen origin'i otomatik yansıtır.

---

## 3. Derleme ve Statik Export (Build)

```bash
npm run build
```

Statik export (`output: "export"`) üretir, çıktı `out/` klasöründe oluşur. Docker imajı da çok aşamalı derleme (multi-stage build) ile tam olarak bunu üretip Nginx'e kopyalar.

---

## 4. Entegrasyon ve Mimari Düzeltmeler

Uygulama monorepo'ya taşınırken yapılan kritik entegrasyon çözümleri:

1. **`basePath` Kaldırıldı:** Eski GitHub Pages özel `basePath: "/DonguNetWeb"` kaldırıldı; uygulama kök adreste çalışır.
2. **CORS `credentials: true`:** `backend/src/main.ts` içinde `credentials: true` aktifleştirildi; tarayıcının refresh token `Set-Cookie` başlığını yok sayması engellendi.
3. **Gövdesiz POST İstekleri (500 Hatası Çözüldü):** Fastify'ın boş gövdeli `application/json` isteklerinde 500 fırlatması sorunu çözüldü (`POST /v1/auth/refresh` artık sayfa her yenilendiğinde oturumu korur).
4. **Marka Adı Güncellemesi:** Arayüzdeki tüm eski proje isimleri ("DöngüNet", "SymbioLoop") **EcoMatch** olarak standardize edildi.

---

## 5. Kod Haritası

```
src/
├── app/
│   ├── layout.tsx                Kök layout ve font yapılandırması
│   └── page.tsx                  Tüm uygulama görünüm yönlendirmesi (Routing)
├── lib/
│   ├── api.ts                    Tek tip API istemcisi (tüm /v1 uçları tipli)
│   ├── session.ts                Access token (localStorage) & oturum durumu
│   └── notificationsSocket.ts    Socket.IO /v1/notifications/stream istemcisi
└── components/
    ├── DashboardView/            Genel istatistikler ve akış kartları
    ├── MaterialsView/            Atık (çıktı) ve girdi yönetim ekranları
    ├── MatchesView/              5 faktörlü eşleştirme ve kabul/red paneli
    ├── OsbDashboardView/         OSB yöneticisi bölge paneli ve Leaflet haritası
    ├── ReviewQueueView/          HITL alan uzmanı onay kuyruğu
    ├── AdminView/                Tesis doğrulama ve AHP ağırlık kalibrasyonu
    ├── ReportsView/              Çevresel etki, CBAM ve DPP rapor indirme
    ├── ChatbotView/              Yerel güvenli asistan sohbet penceresi
    └── PassportView/             DPP QR kodunun açtığı herkese açık doğrulama sayfası
```

### DPP QR Kodu: `/dpp/<passportId>?sig=<hmac>`
Backend, pasaport QR'ını `PUBLIC_BASE_URL` önekiyle üretir (`http://localhost:8080`). Kodu taratan kişinin oturumu olmayabileceğinden doğrulama JWT ile değil, HMAC-SHA256 imzasıyla yapılır. Statik export kısıtını aşmak için Nginx bilinmeyen yolları `index.html`'e düşürür ve `page.tsx` rotayı istemci tarafında yakalar (`parsePassportRoute`).

---

## 6. Backend ve Servis Entegrasyon Durumu

### Gerçek `/v1/*` Çağrıları ile Canlı Çalışan Modüller:
- **Kimlik Doğrulama:** Kayıt, giriş, profil, oturum kapatma, çerez tabanlı rotasyonlu token yenileme.
- **Tesis Yönetimi:** Tesis profili (`/v1/facilities/me`), doğrulama belgesi yükleme.
- **Malzeme Yönetimi:** Çıktı ve girdi CRUD işlemleri, DPP pasaport üretimi.
- **AI Eşleştirme ve Sınıflandırma:**
  - `POST /v1/materials/outputs`: Canlı Python FastAPI SBERT servisi üzerinden 768 boyutlu normalize vektör üretir (`ai-service:8000`).
  - `POST /v1/ai/classify`: 7 kategorili canlı atık sınıflandırma.
- **Eşleştirme Motoru:** pgvector HNSW kosinüs benzerliği, PostGIS mesafe hesabı, 5 faktörlü AHP skorlama, kabul/red/iletişim bilgisi açma (`/v1/matches/:id/contact`).
- **Raporlama:** Çevresel etki ve SKDM (CBAM) PDF çıktısı, DPP JSON verisi (`ReportsView`).
- **Admin ve HITL:** Tesis onaylama, kullanıcı yönetimi, inceleme kuyruğu (`review_queue`), AHP ağırlıkları, IoT API anahtarları.
- **Bildirimler:** Veritabanı bildirim geçmişi ve canlı WebSocket (Socket.IO) akışı.
- **OSB Paneli:** Bölge istatistikleri, Leaflet haritası, aylık PDF/XLSX rapor üretimi.

### Veri Güvenliği Nedeniyle Yerel Çalışan Modüller:
- **Chatbot (`ChatbotView`, `ChatWidget`):** Şartname Madde 10.5 gereğince ("Bakanlık verileri izinsiz üçüncü taraf YZ servislerine aktarılamaz"), harici bulut LLM API'leri yerine yerel deterministik soru-cevap kütüphanesi ile çalışır. Hiçbir tesis veya veri tabanı bilgisi dışarı sızmaz.

---

## 7. Demo Giriş Bilgileri ve Oturum Kuralları

Tüm test hesapları `013_demo_seed_data.sql` ile otomatik yüklenmiştir.

> **Evrensel Demo Şifresi:** `Ecomatch2026!`

| E-posta | Rol | Test Senaryosu |
|---|---|---|
| `aylin@dokutekstil.com.tr` | Tesis Yetkilisi | Çıktı ekleme, anında AI sınıflandırması, eşleşme arama |
| `ali@yapigrup.com.tr` | Tesis Yetkilisi | Karşı teklifi inceleme, eşleşmeyi kabul etme |
| `mehmet@bursaniluferosb.gov.tr` | OSB Yöneticisi | Bölgesel dashboard, harita analizi, aylık rapor indirme |
| `kaan@ecomatch.app` | HITL Uzmanı | Düşük güvenli (<%80) sınıflandırmaları denetleme ve onaylama |
| `ayse@ecomatch.app` | Sistem Admini | Tesis doğrulama, AHP kalibrasyonu, IoT API key üretimi |

> **Önemli Oturum Kuralı (K-18):** Oturum tektir. Aynı kullanıcıyla yeni bir giriş yapıldığında veritabanındaki `refreshToken` sütunu güncellenir ve önceki oturum düşürülür. Bu güvenlik tasarımı gereğidir, hata değildir.

# EcoMatch Web Panel

EcoMatch, yapay zeka destekli endüstriyel simbiyoz ve sürdürülebilirlik yönetim platformudur.
Bu panel, tesislerin atıklarını yönetmesini, eşleştirmeler almasını ve SKDM (CBAM) / Dijital
Ürün Pasaportu (DPP) raporlarını oluşturmasını sağlayan Next.js kontrol panelidir.

Uygulama tamamen istemci tarafında çalışan tek sayfalık bir SPA'dır (`next.config.ts` →
`output: "export"`). Çalışma zamanında Node sunucusuna ihtiyaç duymaz; üretimde statik
dosyaları nginx sunar.

---

## Docker ile çalıştırma (önerilen)

Repo kökünden:

```bash
docker compose up --build
```

Uygulama: **http://localhost:8080**

Bu tek adres hem arayüzü hem API'yi sunar. `web` konteynerindeki nginx şu yolları backend'e
ters vekil olarak iletir:

| Yol | Hedef |
|---|---|
| `/v1/*` | REST API (backend global prefix'i) |
| `/health`, `/health/ready` | Sağlık uçları (`/v1` prefix'inin dışında) |
| `/socket.io/*` | Canlı bildirim akışı (WebSocket yükseltmesiyle) |
| `/api/docs` | Swagger |
| diğer her şey | Statik SPA (bilinmeyen yollar `index.html`'e düşer) |

### Neden ters vekil?

Frontend ve backend tarayıcı açısından **aynı origin'de** olur. Sonuçları:

- CORS hiç devreye girmez — preflight yok, origin listesi tutmaya gerek yok.
- Refresh token'ın httpOnly cookie'si (K-18, `path=/v1/auth`, `SameSite=Lax`) olduğu gibi
  çalışır; `SameSite=None; Secure` gerektirmediği için http üzerinde geliştirirken de
  oturum kalıcı olur.
- Frontend imajı backend'in host portunu bilmek zorunda kalmaz.

### Backend adresini değiştirme

nginx'in hedefi `BACKEND_ORIGIN` ortam değişkeniyle belirlenir
(`web/docker-compose.yml` → varsayılan `http://backend:3000`). Değiştirmek için imajı
**yeniden derlemek gerekmez**, konteyneri yeniden başlatmak yeterlidir.

`NEXT_PUBLIC_API_URL` ise bundan farklıdır: `next build` sırasında JS bundle'ına gömülür,
sonradan değiştirilemez. Docker imajı bunu `"/"` (same-origin) ile derler — yani gerçek
hedefi her zaman `BACKEND_ORIGIN` belirler.

### Backend kapalıyken

nginx, backend adını konteyner ayağa kalkarken değil **istek geldiğinde** çözer. Bu yüzden
backend kapalıyken de arayüz açılır; uygulama kendi `/health/ready` yoklamasıyla "sistem
geçici olarak bakımda" uyarısını gösterir (H2). Bu nedenle `web` servisinin backend'e
`depends_on` bağımlılığı yoktur ve `cd web && docker compose up` tek başına da çalışır.

---

## Yerel geliştirme (`npm run dev`)

```bash
npm install
cp .env.example .env.local   # backend adresini kendi ortamınıza göre düzenleyin
npm run dev -- -p 3002
```

`.env.local` içindeki `NEXT_PUBLIC_API_URL`, backend'i hangi adreste çalıştırdığınızla
**birebir eşleşmelidir**:

| Backend nasıl çalışıyor | Değer |
|---|---|
| Docker'da (`docker compose up`) | `http://localhost:3001` |
| Yerelde `npm run dev` | `http://localhost:3000` (backend `.env` → `PORT`) |

Değişken hiç tanımlı değilse `http://localhost:3001` varsayılır.

Frontend'i backend ile **aynı portta çalıştırmayın** — biri diğerini engeller, yukarıdaki
gibi `-p 3002` verin.

Bu kurulumda frontend ile backend farklı origin'lerde olacağı için CORS devreye girer.
Backend `credentials: true` ile yapılandırılmıştır ve `CORS_ORIGINS` tanımlı değilse
isteğin kendi origin'ini yansıtır — yani ek bir ayar gerekmez. Sıkılaştırmak isterseniz
`backend/.env` içine `CORS_ORIGINS="http://localhost:3002"` yazabilirsiniz.

---

## Build

```bash
npm run build
```

Statik export (`output: "export"`) üretir, çıktı `out/` klasöründe oluşur. Docker imajı da
tam olarak bunu üretip nginx'e kopyalar.

---

## Kod haritası

```
src/app/page.tsx                 Tüm uygulama durumu + görünüm yönlendirmesi
src/lib/api.ts                   Tek API istemcisi — her uç burada tiplenir
src/lib/session.ts               Access token (localStorage); refresh token httpOnly cookie'de
src/lib/notificationsSocket.ts   Socket.IO /v1/notifications/stream
src/components/                  Görünümler ve modal'lar
src/components/PassportView/     DPP QR kodunun açtığı herkese açık pasaport sayfası
```

### DPP QR kodu → `/dpp/<passportId>?sig=<hmac>`

Backend, pasaport QR'ını `PUBLIC_BASE_URL` önekiyle üretir (`dpp.service.ts#buildQrUrl`);
Docker'da bu değer web konteynerinin adresidir (`http://localhost:8080`). Kodu okutan
kişinin oturumu olmayabilir — doğrulama JWT ile değil, HMAC imzasıyla yapılır.

`output: "export"` kullanıldığı için dinamik bir route segmenti (`app/dpp/[id]`)
`generateStaticParams` olmadan üretilemez; pasaport id'leri derleme anında bilinemez. Bunun
yerine nginx bilinmeyen yolları `index.html`'e düşürür ve yol `page.tsx` içinde istemci
tarafında ele alınır (`parsePassportRoute`).

---

## Backend'e bağlı olan / olmayan kısımlar

**Gerçek `/v1/*` çağrıları yapıyor:**

- Auth: register / login / me / logout / refresh (cookie tabanlı oturum geri yükleme)
- Tesis: `facilities/me`, doğrulama belgesi yükleme
- Materials: outputs/inputs CRUD, DPP pasaport üretimi
- Matches: list / find / accept / reject **/ contact** (iletişim bilgileri yalnızca eşleşme
  `completed` olduğunda açılır — `SuccessModal`)
- **Reports: çevresel etki ve SKDM (CBAM) PDF'leri, DPP pasaport verisi** (`ReportsView`)
- Admin: kullanıcılar, tesis doğrulama, review-queue, AHP ağırlıkları, API anahtarları
- Notifications: liste + canlı WebSocket akışı (Header'daki "Bağlı" rozeti gerçek soket
  durumunu gösterir)
- OSB paneli: stats / facilities / map / aylık rapor indirme
- OSB listesi (kayıt formundaki dropdown)

**Bağlı DEĞİL — bilinçli olarak:**

- **Chatbot** (`ChatbotView`, `ChatWidget`): anahtar kelime eşleştirmeli yerel bir sezgisel
  yapı. Backend'de `POST /v1/chat` ve `POST /v1/ai/classify` uçları var ama şu an dummy bir
  istemci tarafından besleniyorlar (K-24, K-31). Gerçek AI servisi devreye girdiğinde
  bağlanacak.
- `DashboardView`'daki IoT ve "Prophet AI" grafikleri: örnek veriyle çizilen görselleştirme
  (backend'de karşılık gelen zaman serisi ucu yok).

---

## Bilinen veri boşlukları

- **`GET /v1/osbs` boş dönüyor** — migration'larda OSB seed verisi yok. Kayıt formundaki OSB
  dropdown'u bu yüzden boş; alan zaten opsiyonel, ama OSB_MANAGER paneli veri olmadan
  anlamlı çalışmaz.
- **`GET /materials/outputs` pasaport ilişkisini döndürmüyor** — pasaport id'si yalnızca
  aynı oturumda `POST /materials/outputs` ile oluşturulmuş kayıtlar için bilinir. Raporlar
  ekranındaki DPP kartı ve `DppModal` bunu dürüstçe belirtir.

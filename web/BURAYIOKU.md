# BURAYI OKU — entegrasyon notları

> Bu dosya başlangıçta "bu klasörü monorepo'nun `web/` dizinine taşırken dikkat edilecekler"
> listesiydi. **Taşıma tamamlandı ve entegrasyon yapıldı.** Aşağıdakiler, o listedeki
> maddelerin şu anki karşılıklarıdır. Güncel kurulum/çalıştırma talimatı için
> [README.md](README.md)'ye bakın.

## 1. Klasör konumu ✅

`eco-match-application/web/` altında. Kök `docker-compose.yml` bu klasörün kendi
`docker-compose.yml`'ini `include` ediyor.

## 2. Bağımlılıklar

`node_modules` git'e dahil değil:

```bash
cd web
npm install
```

Docker kullanıyorsanız bu adım gerekmez — imaj kendi `npm ci`'sini çalıştırır.

## 3. Portlar ve `NEXT_PUBLIC_API_URL` ✅

Docker'da uygulama **http://localhost:8080** adresinde açılır ve API aynı origin üzerinden
sunulur (nginx `/v1`'i backend'e proxy'liyor) — `.env.local` ayarlamanıza gerek yok.

Frontend'i yerelde `npm run dev` ile çalıştıracaksanız `.env.local` oluşturup backend'in
adresini yazın. Backend Docker'daysa host portu **3001**'dir (3000 değil — bu makinede 3000
başka bir konteynerde). Ayrıntı: [README.md](README.md) → "Yerel geliştirme".

## 4. `basePath` kaldırıldı ✅

Eski `basePath: "/DonguNetWeb"` (GitHub Pages'e özeldi) kaldırıldı; uygulama kök adreste.

## 5. CORS — `credentials: true` ✅ DÜZELTİLDİ

`backend/src/main.ts` argümansız `app.enableCors()` kullanıyordu; bu, `credentials`'ı
kapalı bırakıyor ve tarayıcı refresh token'ın `Set-Cookie`'sini sessizce yok sayıyordu.
Artık:

```ts
app.enableCors({ origin: corsOrigins?.length ? corsOrigins : true, credentials: true });
```

`CORS_ORIGINS` (virgülle ayrılmış liste) tanımlanmazsa isteğin kendi origin'i yansıtılır.
Docker akışında frontend ile backend aynı origin'de olduğu için CORS zaten devreye girmez.

### 5b. Ayrıca düzeltildi: gövdesiz POST'lar 500 dönüyordu

Fastify'ın JSON ayrıştırıcısı, `Content-Type: application/json` gönderilip gövdesi boş olan
istekleri hata sayıyordu. `POST /v1/auth/refresh` tam olarak böyle bir istek — sonuç,
**sayfa her yenilendiğinde oturumun kaybedilmesiydi**. İki tarafta da düzeltildi:

- `src/lib/api.ts` gövde yokken `Content-Type` başlığını hiç göndermiyor.
- `backend/src/main.ts` gövdesi kesin olarak boş olan isteklerde başlığı düşürüyor
  (bozuk JSON hâlâ 400 döner, 500 değil).

## 6. Backend'e bağlı olan / olmayan kısımlar — güncellendi

Eskiden "bağlı değil" listesinde olup **artık bağlanan** kısımlar:

- **Raporlar (`ReportsView`)** — "simüle edildi" alert'leri kaldırıldı. Çevresel etki ve
  SKDM (CBAM) raporları gerçek `/v1/reports/*` uçlarından PDF olarak indiriliyor; DPP
  pasaport verisi `/v1/reports/dpp/:passportId`'den JSON olarak alınıyor. (Uçlar
  `JwtAuthGuard` arkasında olduğu için düz `<a href>` yerine token'lı fetch + blob indirme
  kullanılıyor.)
- **Eşleşme iletişim bilgileri (`SuccessModal`)** — sabit sahte isim/telefon yerine gerçek
  `GET /v1/matches/:id/contact` çağrılıyor. Gizlilik kuralı gereği yalnızca eşleşme
  `completed` olduğunda dolar; değilse bunu açıkça söyleyen bir metin gösterilir.
- **`matches/:id/retry`** — backend'de artık implemente edilmiş durumda (Faz 2.8, yalnızca
  süresi dolmuş eşleşmeler için). İstemci metodu `api.ts` içinde hazır.
- **Kontrol panelindeki "AI Eşleşmesi" ve "Önlenen CO2" kartları** — sabit `2` / `900 kg`
  değerleri yerine `GET /v1/matches`'ten türetiliyor.
- **Sidebar'daki tesis adı** — sabit "Gebze Metal A.Ş." yerine `GET /v1/facilities/me`.
- **Header'daki "Bağlı" rozeti** — "Bağlı (Simüle)" değil, gerçek Socket.IO bağlantı durumu.
- **DPP QR kodu** — `/dpp/<passportId>?sig=...` adresi artık gerçek bir sayfa açıyor
  (`PassportView`), imza doğrulamalı ve oturum gerektirmiyor. Öncesinde bu adres boşa
  düşüyordu.

Hâlâ **bağlı değil** (bilinçli):

- **Chatbot** (`ChatbotView`, `ChatWidget`) — backend'deki `/v1/chat` ve `/v1/ai/classify`
  uçları dummy bir istemci tarafından besleniyor (K-24, K-31). Gerçek AI servisi devreye
  girdiğinde bağlanacak.

## 7. Test hesapları ✅ GÜNCELLENDİ — artık kapsamlı bir demo veri seti var

Eski Supabase hesabı (`test@example.com`) geçmişte kaldı. Backend artık ilk açılışta
(`backend/prisma/migrations/013_demo_seed_data.sql`) 13 tesis, 14 kullanıcı, 5 OSB ve
match durum makinesinin **beş durumunun da** (pending/accepted/completed/rejected/expired)
örneklendiği eşleşmelerle geliyor — hepsi gerçekçi rota/km, skor ve CBAM hesabıyla.

**Tüm demo hesapları aynı şifreyi kullanır:** `Ecomatch2026!`

Hızlı başlangıç için: `aylin@dokutekstil.com.tr` (doğrulanmış, 1 tamamlanmış eşleşmesi var) veya
`zeynep@anadoluderi.com.tr` (doğrulanmamış — S1 "onay bekliyor" banner'ını görmek için).
Tam liste ve senaryo haritası: [docs/11-demo-veri-seti.md](../docs/11-demo-veri-seti.md).

Kendi hesabınızı da açabilirsiniz (kayıt formu); veriyi sıfırlamak için:

```bash
docker compose down -v && docker compose up --build
```

> Not: Yeni bir tesis kaydı `verified = false` başlar ve doğrulanana kadar çıktı/girdi
> oluşturamaz (403). Doğrulama bir ADMIN işlemidir — demo'daki `ayse@ecomatch.app` (Sistem
> Admini) ile giriş yapıp admin panelinden onaylayabilir, ya da geliştirme sırasında elle:
> `docker exec eco-match-db psql -U postgres -d eco_match -c "UPDATE facilities SET verified = true WHERE name = '<tesis adı>';"`

> Oturum tektir: aynı kullanıcıyla yeniden giriş yapmak, `users.refreshToken` sütununu
> ezerek önceki oturumu düşürür. Tarayıcıda açık bir oturum varken `curl` ile aynı hesaba
> giriş yaparsanız tarayıcı oturumu kapanır — bu tasarım gereğidir (K-18), hata değil.

## 8. Marka adı ✅

Uygulama içindeki tüm "DöngüNet" referansları "EcoMatch" olarak değiştirilmiş durumda.

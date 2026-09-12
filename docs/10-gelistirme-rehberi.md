# 10 · Geliştirme Rehberi

## Gereksinimler

| Araç | Sürüm | Not |
|---|---|---|
| Node.js | 20 LTS | |
| PostgreSQL | 16 | `pgvector` + `postgis` + `pgcrypto` eklentileriyle |
| Redis | 7 | Embedding kuyruğu, idempotency cache, rate limit |
| Docker | — | Backend + DB'yi birlikte çalıştırmanın en kolay yolu (`backend/docker-compose.yml`) |

## Kurulum

```bash
npm --prefix backend install
cp backend/.env.example backend/.env
```

### Docker ile — tüm yığın (önerilen)

Repo kökündeki `docker-compose.yml`, alt compose dosyalarını `include:` ile birleştirir:

```bash
docker compose up --build
```

**Uygulama: `http://localhost:8080`** — kullanıcının bilmesi gereken tek adres. `web`
konteynerindeki nginx, statik Next.js export'unu sunar ve `/v1`, `/health`, `/socket.io`,
`/api/docs` yollarını backend'e ters vekil olarak iletir. Frontend ile backend tarayıcı
açısından aynı origin'de olduğundan CORS devreye girmez ve refresh token'ın httpOnly
cookie'si (K-18) sorunsuz taşınır. Ayrıntı: `web/README.md`.

`web` servisinin backend'e `depends_on` bağımlılığı yoktur: nginx backend adını istek
anında çözer (`resolver 127.0.0.11`), yani backend kapalıyken de arayüz açılır ve
"sistem geçici olarak bakımda" uyarısı gösterilir (H2).

Backend'in DPP QR/PDF bağlantılarına yazdığı önek `PUBLIC_BASE_URL` ile belirlenir ve
compose'da `http://localhost:8080` olarak ayarlıdır — QR telefondan okutulacağı için bu
değerin **kullanıcının erişebildiği** adres olması gerekir, konteyner içi `backend:3000`
değil.

### Docker ile — yalnızca backend + DB

`backend/docker-compose.yml`, PostgreSQL 16 + pgvector + PostGIS (`backend/docker/postgres/Dockerfile`,
`pgvector/pgvector:pg16` üstüne PostGIS eklenmiş hali) ile backend'i birlikte ayağa kaldırır.
Aşağıdaki komutlar `backend/` içinden çalıştırılır (repo kökünden çalıştıracaksan
`-f backend/docker-compose.yml` ekle):

```bash
cd backend
docker compose up --build
```

Compose proje adı `eco-match` olarak sabitlendi (`docker-compose.yml`'deki `name:`), yani
image/network/volume isimleri klasör adına (`backend`) değil `eco-match-*`'e göre kurulur —
container'lar `eco-match-backend` / `eco-match-db`.

- Backend: `http://localhost:3001` (Swagger: `/api/docs`) — host tarafında 3001, çünkü
  bu makinede 3000 zaten başka bir projenin container'ında; app container içinde/ağda
  yine 3000'de dinliyor. Çakışma yoksa `docker-compose.yml`'de `3001:3000`'i `3000:3000`
  yapabilirsin. `src/` container'a bind-mount edilir ve `nest start --watch` çalışır —
  kod değişikliği otomatik yeniden derlenir. `node_modules` kendi volume'ünde kalır,
  yani Windows'ta derlenmiş native modüller (ör. `bcrypt`) Linux container'ına taşınmaz.
- DB: host'tan `localhost:5434` ile erişilebilir (5432 genelde yerel bir PostgreSQL
  servisi tarafından, 5433 ise AI mikroservisinin kendi `docker-compose.yml`'i
  tarafından kullanılıyor).
- Migration'lar (`backend/prisma/migrations/*.sql`) ilk açılışta otomatik uygulanır:
  Postgres'in `docker-entrypoint-initdb.d` mekanizması dosyaları isim sırasına göre tek
  tek çalıştırır — aşağıdaki `psql` döngüsüyle birebir aynı sonucu verir.

Container zaten ayaktayken sonradan eklenen bir migration'ı (bkz. `/migration`)
uygulamak için — `docker-entrypoint-initdb.d` yalnızca boş volume'de çalışır:

```bash
psql "postgresql://postgres:1397@localhost:5434/eco_match" -f backend/prisma/migrations/NNN_x.sql
```

Şemayı sıfırdan kurmak istersen `docker compose down -v` (`pgdata` volume'ünü siler);
sıradaki `up` tüm migration'ları yeniden uygular.

`package.json` değiştiyse (yeni bağımlılık eklendiyse) `node_modules` volume'ü eski
image'dan kalma olabilir — Compose bir container'ı yeniden oluştururken, mümkünse
önceki container'ın anonymous volume'lerini olduğu gibi taşır. Yeni bağımlılıkları
görmek için:

```bash
docker compose up --build -V
```

(`-V` / `--renew-anon-volumes` olmadan container yeni image'la ayağa kalkar ama
`node_modules` içinde hâlâ eski paket seti olur.)

### Native — backend host'ta, sadece DB Docker'da

Hot-reload'da Docker bind-mount davranışıyla uğraşmak istemeyenler için:

```bash
docker compose up -d db
```

`.env` içinde `DATABASE_URL` / `DIRECT_URL` portunu `5434`'e çevir (pooler değil,
**doğrudan bağlantı**), sonra:

```bash
for f in backend/prisma/migrations/*.sql; do psql "$DIRECT_URL" -f "$f"; done
npm --prefix backend run prisma:generate
npm --prefix backend run dev
```

Swagger: `http://localhost:3000/api/docs`

## Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `PORT` | Evet | Varsayılan 3000 |
| `DATABASE_URL` | Evet | Uygulama sorguları — PgBouncer/pooler URL'i |
| `DIRECT_URL` | Evet | Migration ve seed — doğrudan bağlantı |
| `JWT_SECRET_KEY` | Evet | Uzun ve rastgele. Ortam başına farklı |
| `JWT_ACCESS_TTL` | Hayır | Varsayılan `1h` |
| `JWT_REFRESH_TTL` | Hayır | Varsayılan `30d` |
| `AI_SERVICE_URL` | Hayır | Yoksa AI çağrıları fallback'e düşer (H1) |
| `AI_SERVICE_TIMEOUT_MS` | Hayır | Varsayılan `3000` |
| `REDIS_URL` | Hayır | Kuyruk, cache, rate limit |
| `ANTHROPIC_API_KEY` | Hayır | Chatbot (Faz 3). **Asla frontend'e verilmez** |
| `DPP_SIGNING_SECRET` | Hayır | Public DPP URL'lerinin HMAC imzası |
| `SMTP_*` / `SENDGRID_API_KEY` | Hayır | E-posta doğrulama, şifre sıfırlama |
| `STORAGE_PATH` | Hayır | MVP'de yerel disk; ileride S3/MinIO |

> `backend/.env` gerçek kimlik bilgileri içeriyor ve `.gitignore`'da. Yeni bir değişken
> eklerken **`.env.example`'ı da güncelle** — ekip arkadaşların neyin gerektiğini oradan
> görüyor.

## Komutlar

```bash
npm --prefix backend run dev             # watch modunda
npm --prefix backend run build           # derleme
npm --prefix backend run lint
npm --prefix backend run format
npm --prefix backend run test
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:studio   # DB'yi tarayıcıda gez
```

**Dikkat — `prisma:migrate` çalıştırma.** `prisma migrate dev`, pgvector ve PostGIS kolonlarını
temsil edemediği için bozar. Şema değişikliği `.sql` dosyası yazarak yapılır — bkz.
[09-kararlar.md](09-kararlar.md) K-04 ve `/migration` slash komutu.

## Kod standartları

### Modül yapısı

Her modül `backend/src/modules/<ad>/` altında, aynı iskeletle:

```
<ad>.module.ts
<ad>.controller.ts
<ad>.service.ts
<ad>.dto.ts
```

Referans implementasyon `modules/auth/`. Bir servis birden fazla net sorumluluk
taşımaya başlarsa aynı klasörde böl (`scoring.service.ts`, `cbam.service.ts`).

### Katman kuralları

- **Controller ince kalır.** Guard uygula, DTO al, servise devret, dön. İş kuralı yok,
  Prisma çağrısı yok.
- **İş kuralı serviste.** Servis HTTP'yi bilmez; Nest exception'ları fırlatır.
- **Raw SQL sadece serviste.** `vector` veya `geography` içeren her sorgu
  `$queryRaw` tagged template ile. `$queryRawUnsafe` ve string birleştirme yasak.

### İsimlendirme ve dil

| Ne | Dil | Örnek |
|---|---|---|
| Değişken, fonksiyon, sınıf | İngilizce | `calculateMatchScore` |
| Yorum | İngilizce | |
| Commit mesajı | İngilizce | |
| Log satırı | İngilizce | |
| **Kullanıcıya giden mesaj** | **Türkçe** | `'Tesisiniz henüz onaylanmadı'` |
| **DTO validasyon mesajı** | **Türkçe** | Doğrudan kullanıcıya gösteriliyor |
| Doküman (`docs/`) | Türkçe | |

Sebep: hata mesajları son kullanıcıya gidiyor, kod ise ekosistemin dilinde.

### DTO

```ts
export class CreateOutputDto {
  @IsString()
  @IsNotEmpty({ message: 'Açıklama zorunludur.' })
  @MaxLength(5000, { message: 'Açıklama en fazla 5000 karakter olabilir.' })
  description: string;

  @IsOptional()
  @IsEnum(MaterialClass, { message: 'Geçersiz malzeme sınıfı.' })
  materialClass?: MaterialClass;

  @IsNumber({}, { message: 'Miktar sayı olmalıdır.' })
  @IsPositive({ message: 'Miktar sıfırdan büyük olmalıdır.' })
  quantityKg: number;
}
```

Global `ValidationPipe` `forbidNonWhitelisted: true` ile çalışıyor — **DTO'da tanımlanmayan
her alan isteği reddeder**. Yeni bir alan kabul edecekse önce DTO'ya ekle.

### Hata fırlatma

```ts
throw new ForbiddenException({
  error: 'FACILITY_NOT_VERIFIED',
  message: 'Tesisiniz henüz onaylanmadı.',
});
```

`error` kodu makine tarafından okunur ve **değişmez** — frontend ona göre dallanıyor.
Kod listesi [04-api-sozlesmesi.md](04-api-sozlesmesi.md)'de; yeni kod eklerken oraya da yaz.

### Guard'lar

| Guard | Ne yapar |
|---|---|
| `JwtAuthGuard` | Token doğrular, `request.user`'a payload koyar |
| `RolesGuard` | `@Roles('admin','expert')` ile kullanılır |
| `VerifiedFacilityGuard` | `facility.verified = false` ise 403 |

Çoğu malzeme ve eşleştirme endpoint'i üçünü de gerektirir. Hangi endpoint'in neye
ihtiyacı olduğu [04-api-sozlesmesi.md](04-api-sozlesmesi.md) tablolarında.

## Test

```bash
npm --prefix backend run test
npm --prefix backend run test -- --coverage
```

`test/index.js`, sunucuyu kendisi başlatmaz — `API_URL` (varsayılan `localhost:3000/v1`)
adresine HTTP isteği atar ve DB temizliği için kendi Prisma bağlantısını açar (`.env`'i
yükler). Backend'i `backend/docker-compose.yml` ile çalıştırıyorsan ve host portu 3000
değilse (bkz. yukarıdaki Docker bölümü), testi çalıştırmadan önce override et:

```bash
API_URL="http://localhost:3001/v1" DATABASE_URL="postgresql://postgres:1397@localhost:5434/eco_match?schema=public" DIRECT_URL="postgresql://postgres:1397@localhost:5434/eco_match?schema=public" npm --prefix backend run test
```

(PowerShell: `$env:API_URL="http://localhost:3001/v1"; $env:DATABASE_URL="postgresql://postgres:1397@localhost:5434/eco_match?schema=public"; $env:DIRECT_URL=$env:DATABASE_URL; npm --prefix backend run test`)

`DATABASE_URL`/`DIRECT_URL` override'ı gerekli çünkü test süreci `.env`'deki bağlantı
dizesini doğrudan kendi Prisma client'ı için de kullanıyor — konteynerdeki backend'in
gördüğü veritabanının aynısına (host'tan `5434`) bakmazsa, HTTP üzerinden oluşturduğu
veriyi kendi DB sorgularında bulamaz.

Test isimleri senaryo kodunu taşır:

```ts
describe('S4 · match acceptance', () => {
  it('first accept moves pending -> accepted', ...);
  it('second accept moves accepted -> completed', ...);
  it('accept on completed match returns 409', ...);
});

describe('E7 · concurrent accept race', () => {
  it('second concurrent accept fails with INSUFFICIENT_STOCK', ...);
});
```

| Katman | Ne test edilir |
|---|---|
| Unit | Skorlama formülleri, CBAM hesabı, ESPR doğrulama, durum makinesi geçişleri |
| Integration | Endpoint + gerçek DB (test veritabanı), pgvector sorguları |
| E2E | Playwright, [06-senaryolar.md](06-senaryolar.md) sonundaki yolculuk |

Öncelikli test alanları — bunlar sessizce bozulup production'da patlayan yerler:
durum makinesi geçişleri, eşzamanlılık (E7), self-match filtresi (E1), birim dönüşümü (E4),
AI fallback yolu (H1).

## Git

```
main          korumalı — doğrudan push yok
feat/<konu>   özellik dalları
fix/<konu>    hata düzeltme
```

Commit mesajı: İngilizce, emir kipi, tek satır özet.

```
add pgvector candidate query with self-match filter

Implements E1 filtering in the matching query. Candidates from the
same facility are excluded before scoring.
```

### PR kontrol listesi

- [ ] `npm run build` geçiyor
- [ ] Test yazıldı, senaryo kodu isimde geçiyor
- [ ] Şema değiştiyse [03-veri-modeli.md](03-veri-modeli.md) güncellendi
- [ ] Endpoint değiştiyse [04-api-sozlesmesi.md](04-api-sozlesmesi.md) + `src/docs/*.yml` güncellendi
- [ ] Mimari karar alındıysa [09-kararlar.md](09-kararlar.md)'a kayıt düşüldü
- [ ] `.env` değişkeni eklendiyse `.env.example` güncellendi
- [ ] Kullanıcıya giden yeni mesajlar Türkçe

## Claude Code kullanımı

Bu repoda üç slash komut tanımlı:

| Komut | Ne yapar |
|---|---|
| `/migration <açıklama>` | SQL migration yazar, uygular, `schema.prisma`'yı senkronlar |
| `/modul-ekle <ad>` | Proje konvansiyonlarıyla NestJS modülü kurar |
| `/senaryo <kod>` | `docs/06`'daki senaryoyu uçtan uca implemente eder |

`CLAUDE.md` her oturumda otomatik yükleniyor — mimari, sabitler ve kaçınılması gereken
şeyler orada. Bir kural sürekli ihlal ediliyorsa `CLAUDE.md`'ye ekle; sohbette tekrar
tekrar söylemek yerine.

## Sık karşılaşılan sorunlar

**`prisma generate` sonrası tipler kaybolmuş.**
`schema.prisma` diskte var mı kontrol et. Bir dönem sadece
`node_modules/.prisma/client/schema.prisma` içinde vardı (K-11) — o kopya
`npm ci` ile silinir.

**pgvector sorgusu "operator does not exist" veriyor.**
`CREATE EXTENSION vector` çalıştırılmamış ya da yanlış veritabanında. `<=>` operatörü
eklenti olmadan yok.

**Vektör INSERT'i tip hatası veriyor.**
Vektör string olarak gönderilmeli: `` `[${vector.join(',')}]` `` ve `::vector` ile
cast edilmeli. Dizi olarak gönderilmez.

**Eşleşme hiç sonuç dönmüyor.**
Sırayla bak: embedding var mı (`embedding_pending`), tesis doğrulanmış mı,
`pending_review` açık mı, karşı tarafta gerçekten `input` kaydı var mı, similarity
gerçekten 0.60'ın üstünde mi. Filtre listesi [05-is-kurallari.md](05-is-kurallari.md)'de.

**Validation "property should not exist" diyor.**
`forbidNonWhitelisted` açık; alan DTO'da tanımlı değil.

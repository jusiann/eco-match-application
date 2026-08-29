# 10 · Geliştirme Rehberi

## Gereksinimler

| Araç | Sürüm | Not |
|---|---|---|
| Node.js | 20 LTS | |
| PostgreSQL | 16 | `pgvector` + `postgis` + `pgcrypto` eklentileriyle |
| Redis | 7 | Embedding kuyruğu, idempotency cache, rate limit |
| Docker | — | Yerel PostgreSQL için en kolay yol |

## Kurulum

```bash
npm --prefix backend install
```

Veritabanı — eklentileri hazır bir imaj kullan, yoksa elle kurman gerekir:

```bash
docker run -d --name ecomatch-db -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=eco_match postgis/postgis:16-3.4
```

`pgvector` bu imajda yok; eklemek için `pgvector/pgvector:pg16` ile PostGIS'i birleştiren
bir imaj ya da kendi `Dockerfile`'ın gerekir. Faz 0'da `docker-compose.yml` bunu
çözecek — o zamana kadar yerel kurulum.

Ortam değişkenleri:

```bash
cp backend/.env.example backend/.env
```

Migration'ları sırayla uygula (pooler değil, **doğrudan bağlantı**):

```bash
for f in backend/prisma/migrations/*.sql; do psql "$DIRECT_URL" -f "$f"; done
```

Prisma istemcisini üret:

```bash
npm --prefix backend run prisma:generate
```

Çalıştır:

```bash
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

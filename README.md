# EcoMatch

Organize Sanayi Bölgelerinde endüstriyel simbiyozu otomatikleştiren AI destekli platform.
Bir tesisin atığı, başka bir tesisin hammaddesi — EcoMatch bu eşleşmeyi bulur, skorlar ve
gerekli uyum belgelerini (DPP, CBAM) üretir.

**TEKNOFEST 2026** · Sıfır Atık & Döngüsel Ekonomi · Takım: VectorMatch

## Hızlı başlangıç

```bash
npm --prefix backend install
cp backend/.env.example backend/.env
npm --prefix backend run dev
```

Swagger: `http://localhost:3000/api/docs`

Ayrıntılı kurulum ve veritabanı hazırlığı: [docs/10-gelistirme-rehberi.md](docs/10-gelistirme-rehberi.md)

### Docker ile — tüm stack tek komutla

Repo kökündeki `docker-compose.yml`; `backend/docker-compose.yml` (backend + DB),
`web/docker-compose.yml` (Next.js arayüzü + nginx) ve `AI Microservice/docker-compose.yml`
(AI ekibinin kendi scratch DB'si) dosyalarını `include:` ile birleştirir:

```bash
docker compose up --build
```

**Uygulamayı `http://localhost:8080` adresinden açın.** Kullanıcının bilmesi gereken tek
adres burasıdır — nginx `/v1`, `/health`, `/socket.io` ve `/api/docs` yollarını backend'e
ters vekil (reverse proxy) olarak iletir. Frontend ile backend tarayıcı açısından aynı
origin'de olduğu için CORS hiç devreye girmez ve refresh token'ın httpOnly cookie'si
(K-18) sorunsuz çalışır.

| Adres | Ne |
|---|---|
| `http://localhost:8080` | Web arayüzü **ve** API (aynı origin) |
| `http://localhost:8080/api/docs` | Swagger, aynı vekil üzerinden |
| `http://localhost:3001` | Backend'e doğrudan erişim (curl / e2e paketi için) |
| `localhost:5434` | Backend PostgreSQL |
| `localhost:5433` | AI mikroservisinin scratch pgvector DB'si |

- Backend'in host portu 3001 — bu makinede 3000 başka bir projede kullanılıyor,
  bkz. [docs/10](docs/10-gelistirme-rehberi.md).
- AI mikroservisinin FastAPI uygulaması (`uvicorn`) buna dahil değil — hâlâ ayrı, native
  çalıştırılıyor (bkz. `AI Microservice/README.md`); backend AI'siz de çalışır (H1
  fallback). AI'ye bağlı uçlar şu an bilinçli olarak dummy.
- Her parça tek başına da çalıştırılabilir (`cd web && docker compose up` gibi); web
  konteyneri backend kapalıyken de açılır, arayüz "sistem geçici olarak bakımda"
  uyarısını gösterir.
- Frontend ayrıntıları: [web/README.md](web/README.md)

## Dokümantasyon

Tüm teknik dokümantasyonlar [`docs/`](docs/README.md) altında.

| Doküman | İçerik |
|---|---|
| [01 · Proje Genel Bakış](docs/01-proje-genel-bakis.md) | Problem, çözüm, aktörler, personalar, sözlük |
| [02 · Mimari](docs/02-mimari.md) | Servis topolojisi, katmanlar, veri akışı |
| [03 · Veri Modeli](docs/03-veri-modeli.md) | Şema, enum'lar, indeksler, migration sırası |
| [04 · API Sözleşmesi](docs/04-api-sozlesmesi.md) | Endpoint'ler, hata formatı, rate limit |
| [05 · İş Kuralları](docs/05-is-kurallari.md) | Skorlama, CBAM, DPP, durum makinesi |
| [06 · Senaryolar](docs/06-senaryolar.md) | Kabul kriterleri, edge case'ler, test matrisi |
| [07 · AI Entegrasyonu](docs/07-ai-entegrasyonu.md) | AI servis sınırı ve sözleşmesi |
| [08 · Yol Haritası](docs/08-yol-haritasi.md) | Fazlar, görevler, çıkış kriterleri |
| [09 · Kararlar](docs/09-kararlar.md) | Mimari karar kayıtları |
| [10 · Geliştirme Rehberi](docs/10-gelistirme-rehberi.md) | Kurulum, standartlar, test, PR |

## Yapı

```
backend/            NestJS 10 + Fastify + Prisma 5 + PostgreSQL 16
web/                Next.js 16 (statik export) + nginx — arayüz ve API vekili
AI Microservice/    Python/FastAPI/SBERT — ayrı ekip tarafından geliştiriliyor
docs/               Teknik dokümantasyon
.claude/            Claude Code yapılandırması ve slash komutları
docker-compose.yml  backend + DB + web + AI'nin scratch DB'sini birlikte ayağa kaldırır
```

Hepsi aynı repoda (monorepo), ama `AI Microservice/` (Python/FastAPI/SBERT) ve ileride
eklenecek frontend (Next.js/React Native) ayrı ekipler tarafından geliştiriliyor — bkz.
`CLAUDE.md`, burada implemente edilmiyorlar.

## Durum

Auth modülü çalışıyor. Sıradaki iş **Faz 0** — şema migration'ları ve ortak altyapı.
Bkz. [docs/08-yol-haritasi.md](docs/08-yol-haritasi.md).

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

## Dokümantasyon

Tüm teknik dokümantasyon [`docs/`](docs/README.md) altında.

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
backend/          NestJS 10 + Fastify + Prisma 5 + PostgreSQL 16
docs/             Teknik dokümantasyon
.claude/          Claude Code yapılandırması ve slash komutları
```

AI mikroservisi (Python/FastAPI/SBERT) ve frontend (Next.js/React Native) ayrı repolarda,
ayrı ekipler tarafından geliştiriliyor.

## Durum

Auth modülü çalışıyor. Sıradaki iş **Faz 0** — şema migration'ları ve ortak altyapı.
Bkz. [docs/08-yol-haritasi.md](docs/08-yol-haritasi.md).

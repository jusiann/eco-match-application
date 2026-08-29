# EcoMatch — Doküman Kütüphanesi

Bu klasör EcoMatch platformunun tek gerçek kaynağıdır. Kod ile doküman çeliştiğinde
doğru olan taraf tartışmaya açıktır — ama sessizce ayrışmasına izin verilmez. Bir şeyi
değiştirdiğinde ilgili dokümanı da aynı commit'te güncelle.

## Okuma sırası

Projeye yeni katılıyorsan sırayla oku. Zaten içindeysen tablodan atla.

| # | Doküman | Ne zaman bakarsın |
|---|---|---|
| 01 | [Proje Genel Bakış](01-proje-genel-bakis.md) | EcoMatch nedir, kim kullanır, hangi terim ne demek |
| 02 | [Mimari](02-mimari.md) | Servisler nasıl bölünmüş, kim neyi yazıyor, veri nasıl akıyor |
| 03 | [Veri Modeli](03-veri-modeli.md) | Tablo, kolon, enum, indeks, migration sırası |
| 04 | [API Sözleşmesi](04-api-sozlesmesi.md) | Endpoint yazmadan / çağırmadan önce |
| 05 | [İş Kuralları](05-is-kurallari.md) | Skorlama, CBAM, DPP, eşikler, durum makinesi |
| 06 | [Senaryolar](06-senaryolar.md) | "Kullanıcı X yaparsa ne olur?" — kabul kriterleri |
| 07 | [AI Entegrasyonu](07-ai-entegrasyonu.md) | AI servisiyle sınır, sözleşme, hata davranışı |
| 08 | [Yol Haritası](08-yol-haritasi.md) | Sıradaki iş ne, hangi fazdayız |
| 09 | [Kararlar](09-kararlar.md) | "Bu neden böyle?" sorusunun cevabı |
| 10 | [Geliştirme Rehberi](10-gelistirme-rehberi.md) | Kurulum, kod standardı, commit, test |

## Hızlı gerçekler

| Konu | Değer |
|---|---|
| Proje adı | **EcoMatch** (DönguNet ve SymbioLoop artık kullanılmıyor) |
| Takım adı | VectorMatch |
| Yarışma | TEKNOFEST 2026 — Sıfır Atık & Döngüsel Ekonomi |
| Olgunluk | TRL 4 → hedef 6-7 (pilot OSB) |
| Backend | NestJS 10 + Fastify + Prisma 5 |
| Veritabanı | PostgreSQL 16 + pgvector + PostGIS |
| AI servisi | Python 3.11 + FastAPI + SBERT (`all-mpnet-base-v2`, 768D) — **ayrı ekip** |
| Frontend | Next.js 14 + React Native — **ayrı ekip** |
| Benzerlik eşiği | 0.60 |
| Uzman onay eşiği | güven < 0.80 |

## Kaynak belgeler

Bu dokümanlar aşağıdaki materyallerden türetildi. Çelişki olursa **bu klasör kazanır** —
kaynak belgeler proje adı ve bazı eşik değerleri konusunda eskimiş durumda
(bkz. [09-kararlar.md](09-kararlar.md)).

- `DonguNet_Teknik_Uyum_ve_Yazilim_Plani.pdf` — tutarsızlık çözümleri, migration SQL'leri, 8 haftalık plan
- `DonguNet_Senaryo_Kutuphanesi.pdf` — persona, senaryo, kabul kriteri, test matrisi
- Use Case / ER / Sequence / Class diyagramları (4 görsel)

## Doküman bakım kuralı

- Yeni bir özellik geldiğinde önce [06-senaryolar.md](06-senaryolar.md) içinde karşılığı
  var mı diye bak. Yoksa önce senaryoyu yaz, sonra kodu.
- Mimari etkisi olan bir karar aldıysan [09-kararlar.md](09-kararlar.md) dosyasına kaydını
  düş — sonradan "biz bunu neden böyle yapmıştık" tartışmasını bu dosya bitirir.
- Şema değişikliği [03-veri-modeli.md](03-veri-modeli.md) güncellenmeden merge edilmez.

# EcoMatch — Doküman Kütüphanesi

Bu klasör EcoMatch platformunun tek gerçek kaynağıdır. Kod ile doküman çeliştiğinde
doğru olan taraf tartışmaya açıktır — ama sessizce ayrışmasına izin verilmez. Bir şeyi
değiştirdiğinde ilgili dokümanı da aynı commit'te güncelle.

## Okuma sırası

Projeye yeni katılıyorsan sırayla oku. Zaten içindeysen tablodan atla.

| #   | Doküman                                                                | İlgili Şartname Maddesi / Amacı                               |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| 01  | [Proje Genel Bakış](01-proje-genel-bakis.md)                           | EcoMatch nedir, kim kullanır, hangi terim ne demek            |
| 02  | [Mimari](02-mimari.md)                                                 | Servisler nasıl bölünmüş, kim neyi yazıyor, veri nasıl akıyor |
| 03  | [Veri Modeli](03-veri-modeli.md)                                       | Madde 10.3 (5): Şema, pgvector HNSW, 602 satırlık veri.csv    |
| 04  | [API Sözleşmesi](04-api-sozlesmesi.md)                                 | Endpoint sözleşmeleri, hata formatı, rate limit               |
| 05  | [İş Kuralları](05-is-kurallari.md)                                     | Skorlama, CBAM, DPP, eşikler, durum makinesi                  |
| 06  | [Senaryolar](06-senaryolar.md)                                         | "Kullanıcı X yaparsa ne olur?" — kabul kriterleri             |
| 07  | [AI Entegrasyonu](07-ai-entegrasyonu.md)                               | AI servisiyle sınır, sözleşme, hata davranışı                 |
| 08  | [Yol Haritası](08-yol-haritasi.md)                                     | Modül durumları, tamamlanan fazlar                            |
| 09  | [Kararlar](09-kararlar.md)                                             | Mimari Karar Kayıtları (ADR)                                  |
| 10  | [Geliştirme Rehberi](10-gelistirme-rehberi.md)                         | Geliştirici ortamı, standartlar, commit, test                 |
| 11  | [Demo Veri Seti](11-demo-veri-seti.md)                                 | Giriş bilgileri, seed'lenmiş tesis/eşleşme senaryoları        |
| 12  | [Kurulum Kılavuzu](12-kurulum-kilavuzu.md)                             | Madde 10.3 (2 & 8): Jüri için tek komutla kurulum rehberi     |
| 13  | [Kullanıcı Kılavuzu](13-kullanici-kilavuzu.md)                         | Madde 10.3 (3): 4 rol için görsel son kullanıcı el kitabı     |
| 14  | [Kütüphane ve Lisanslar](14-kutuphane-ve-lisanslar.md)                 | Madde 10.3 (6) & 10.4: Lisans uyumu ve PostGIS analizi        |
| 15  | [Yapay Zekâ Beyanı](15-yapay-zeka-beyani.md)                           | Madde 10.5: Veri sınırı, sentetik veri ifşası, F1 analizi     |
| 16  | [Çevresel Etki Metodolojisi](16-cevresel-etki-metodolojisi.md)         | Madde 10.9: Varsayım, yöntem, veri kaynağı, tCO2e hesabı     |
| 17  | [Veri Güvenliği ve Silme Beyanı](17-veri-guvenligi-ve-silme-beyani.md) | Madde 10.6: KVKK ve 15 günlük veri imha taahhütnamesi        |
| 18  | [Demo Videosu Senaryosu](18-demo-videosu-senaryosu.md)                 | Madde 10.3 (7): 5 dakikalık jüri çekim planı ve seslendirme  |
| 19  | [Teknik Mimari Raporu](teknik-mimari-raporu.md)                        | Madde 10.3 (4): 6 zorunlu başlığı birleştiren tek PDF raporu  |

## Hızlı gerçekler

| Konu             | Değer                                                     |
| ---------------- | --------------------------------------------------------- |
| Proje adı        | **EcoMatch** (DönguNet ve SymbioLoop artık kullanılmıyor) |
| Takım adı        | VectorMatch                                               |
| Takım ID         | #1003771                                                  |
| Yarışma          | TEKNOFEST 2026 — Sıfır Atık & Döngüsel Ekonomi            |
| Olgunluk         | TRL 4 → hedef 6-7 (pilot OSB)                             |
| Backend          | NestJS 10 + Fastify + Prisma 5                            |
| Veritabanı       | PostgreSQL 16 + pgvector + PostGIS                        |
| AI servisi       | Python 3.12 + FastAPI + SBERT (`all-mpnet-base-v2`, 768D) |
| Frontend         | Next.js 16 (statik export) + nginx                        |
| Benzerlik eşiği  | 0.60                                                      |
| Uzman onay eşiği | güven < 0.80                                              |

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

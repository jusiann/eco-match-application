# Eco Match AI Mikroservisi

Atık ilanlarını hammadde taleplerine anlamsal olarak eşleştiren, atıkları 7 kategoriye sınıflandıran SBERT tabanlı mikroservis.

## Hızlı Başlangıç

1. Sanal ortam: `python -m venv .venv && .venv\Scripts\activate`
2. Bağımlılıklar: `pip install -r requirements.txt`
3. PostgreSQL: `docker compose up -d`
4. **Modeli eğit: `python fine_tune.py`** → `./fine_tuned_model` üretir (~5 dk, tek seferlik)
5. Eğitimi doğrula: `python evaluate_finetuned.py` → ayrım ≥ 0.65 çıkmalı
6. Başlangıç verisi: `python seed_from_csv.py`
7. Servisi başlat: `uvicorn app.main:app --port 8000`
8. Test: `python tests/test_final.py`

> **Not:** 4. adım atlanırsa servis fine-tuned modeli bulamaz. `app/` içindeki
> model yükleme kontrolü bu durumda açılışta hata verir — sessizce orijinal
> modele düşmez.

## Endpoint'ler

| Endpoint             | Method | Açıklama                  |
| -------------------- | ------ | ------------------------- |
| `/health`            | GET    | Servis durumu             |
| `/embed`             | POST   | Metin → 768 vektör        |
| `/embed/passport`    | POST   | Pasaport → vektör + metin |
| `/classify`          | POST   | Metin → kategori          |
| `/search`            | POST   | Benzerlik araması         |
| `/reload-prototypes` | POST   | Prototip güncelleme       |

## Mimari

İki ayrı model kullanılır — tek modelle her iki görevi optimize etme denemesi başarısız olduğu için (bkz. geliştirme raporu, v6):

- **Eşleştirme** (`/embed`, `/search`): `all-mpnet-base-v2` üzerinden fine-tune edilmiş alan-özel model (602 satırlık veri seti, `CosineSimilarityLoss`)
- **Sınıflandırma** (`/classify`): Orijinal `all-mpnet-base-v2` + prototip tabanlı yaklaşım, 7 kategori, prototipler DB'den yüklenir
- **Hibrit arama**: BM25 + SBERT, alpha = 0.1 (BM25 ağırlığı)
- **Eşik**: Kosinüs benzerliği 0.49
- **DB**: PostgreSQL 16 + pgvector, `vector(768)` (Docker, port 5433)
- **Framework**: FastAPI, stateless mikroservis

## Performans

212 eşleştirme çifti (85 pozitif / 102 negatif / 25 sınırda) ve 140 örneklik sınıflandırma seti üzerinde ölçülmüştür.

**Eşleştirme**

| Metrik                    | Değer     |
| ------------------------- | --------- |
| F1 (optimal eşik 0.49)    | **0.883** |
| Yanlış pozitif oranı      | **%5.9**  |
| Pozitif çiftler ort. skor | 0.7351    |
| Negatif çiftler ort. skor | 0.0600    |
| Pozitif–negatif ayrımı    | 0.675     |

**Sınıflandırma**

| Girdi tipi      | Doğruluk  |
| --------------- | --------- |
| Normal ifadeler | %92.9     |
| Karma içerik    | %92.9     |
| Kısa metin      | %82.1     |
| Yazım hatalı    | %64.3     |
| Kısaltmalar     | %46.4     |
| **Toplam**      | **%76.4** |

**Fine-tuning etkisi**

| Metrik                 | Orijinal | Fine-tuned |
| ---------------------- | -------- | ---------- |
| Pozitif–negatif ayrımı | 0.012    | 0.694      |
| Optimal F1             | 0.668    | 0.920      |
| Precision@optimal      | 0.522    | 0.917      |
| Recall@optimal         | 0.927    | 0.922      |

### Bilinen sınırlar

- Sektör kısaltmaları (PE-HD, ATY) çözülemiyor — %46.4
- Yüzeysel benzer ama endüstriyel olarak eşleşmeyen çiftler hâlâ yüksek skor alabiliyor
- Ölçümler sentetik test setinde yapılmıştır; saha verisiyle doğrulama roadmap'tedir

Modelin v1'den v9'a kadar nasıl geliştiği, hangi noktalarda hata alındığı ve nasıl çözüldüğü ölçüm grafikleriyle belgelenmiştir → [`GELISTIRME-RAPORU.md`](GELISTIRME-RAPORU.md)

## Test Paketi

- `tests/test_final.py` — 6 endpoint'in tek seferde son kontrolü (MVP onayı)
- `tests/test_e2e.py` — canlı servise HTTP ile uçtan uca senaryo testi
- `tests/test_kapsamli.py`, `tests/test_kapsamli_v2.py` — veri.csv üzerinden kapsamlı model/sınıflandırma değerlendirmesi ve grafikler
- `evaluate_finetuned.py` — orijinal vs fine-tuned model A/B karşılaştırması
- `tests/archive/` — geliştirme sürecinde kullanılmış eski/tekil test scriptleri (referans amaçlı saklanır)

Test çıktı grafikleri: `docs/tests/`

## Sunum ve Demo

- `demo_scenario.py` — canlı sunum demo senaryosu (iki OSB, 6 tesis eşleştirmesi)
- `presentation_graphs.py` — sunum için 6 grafik üretir (mimari, pipeline, model karşılaştırması, confusion matrix, eşik analizi, teknoloji stack)

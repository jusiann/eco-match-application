# DöngüNet AI Mikroservisi

## Hızlı Başlangıç

1. Sanal ortam: `python -m venv .venv && .venv\Scripts\activate`
2. Bağımlılıklar: `pip install -r requirements.txt`
3. PostgreSQL: `docker compose up -d`
4. Başlangıç verisi: `python seed_from_csv.py`
5. Servisi başlat: `uvicorn app.main:app --port 8000`
6. Test: `python tests/test_final.py`

## Endpoint'ler

| Endpoint | Method | Açıklama |
| --- | --- | --- |
| `/health` | GET | Servis durumu |
| `/embed` | POST | Metin → 768 vektör |
| `/embed/passport` | POST | Pasaport → vektör + metin |
| `/classify` | POST | Metin → kategori |
| `/search` | POST | Benzerlik araması |
| `/reload-prototypes` | POST | Prototip güncelleme |

## Mimari

- Model: SBERT fine-tuned (`all-mpnet-base-v2` → domain-specific), eşleştirme (`/embed`, `/search`) için kullanılır
- Sınıflandırma: Ayrı, orijinal (multilingual) SBERT model + prototip tabanlı yaklaşım, 7 kategori, DB'den yükleme
- DB: PostgreSQL 16 + pgvector (Docker, port 5433)
- Framework: FastAPI
- Hibrit Arama: BM25 + SBERT

## Performans

(evaluate_finetuned.py sonuçlarından doldurulacak)

## Test Paketi

- `tests/test_final.py` — 6 endpoint'in tek seferde son kontrolü (MVP onayı)
- `tests/test_e2e.py` — canlı servise HTTP ile uçtan uca senaryo testi
- `tests/test_kapsamli.py`, `tests/test_kapsamli_v2.py` — veri.csv üzerinden kapsamlı model/sınıflandırma değerlendirmesi ve grafikler
- `tests/archive/` — geliştirme sürecinde kullanılmış eski/tekil test scriptleri (referans amaçlı saklanır)

## Sunum ve Demo

- `demo_scenario.py` — canlı sunum demo senaryosu (iki OSB, 6 tesis eşleştirmesi)
- `presentation_graphs.py` — sunum için 6 grafik üretir (mimari, pipeline, model karşılaştırması, confusion matrix, eşik analizi, teknoloji stack)

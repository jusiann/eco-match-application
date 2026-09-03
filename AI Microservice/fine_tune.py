"""Sentence-BERT fine-tuning scripti — DöngüNet AI mikroservisi.

veri.csv içindeki 10 bölümden pozitif/negatif eğitim çiftlerini çıkarır,
enrich_text() ile zenginleştirir, %80/%20 stratified split yapar ve
CosineSimilarityLoss ile all-mpnet-base-v2 modelini fine-tune eder.

ÇALIŞTIRMA: python fine_tune.py
(Bu script sadece OLUŞTURULMUŞTUR — kullanıcı kendisi çalıştıracaktır.)
"""
from __future__ import annotations

import csv
import random
import sys
import time
from pathlib import Path

# Windows konsolda Türkçe karakterlerin doğru basılması için
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

CSV_PATH = Path(__file__).parent / "veri.csv"
OUTPUT_PATH = Path(__file__).parent / "fine_tuned_model"
BASE_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"

RANDOM_STATE = 42
TEST_SIZE = 0.2
EPOCHS = 10
BATCH_SIZE = 16


# ─────────────────────────────────────────────────────────────────
# ADIM 1 — Bağımlılık kontrolü
# ─────────────────────────────────────────────────────────────────
def check_dependencies() -> None:
    """Gerekli kütüphaneleri kontrol et, eksikse net bir hata ile durdur."""
    missing = []
    try:
        import sentence_transformers  # noqa: F401
    except ImportError:
        missing.append("sentence-transformers")
    try:
        import torch  # noqa: F401
    except ImportError:
        missing.append("torch")
    try:
        import datasets  # noqa: F401
    except ImportError:
        # sentence-transformers 3.x, model.fit() içinde DataLoader'ı
        # datasets.Dataset'e çeviriyor — bu paket olmadan eğitim patlar.
        missing.append("datasets")
    try:
        import accelerate  # noqa: F401
    except ImportError:
        # sentence-transformers 3.x, model.fit() içinde HuggingFace Trainer
        # kullanıyor — bu da accelerate>=0.26.0 gerektiriyor.
        missing.append("accelerate>=0.26.0")

    if missing:
        print("═══ HATA: Eksik bağımlılıklar ═══")
        print(f"Kurulu olmayan paketler: {', '.join(missing)}")
        print(f"Kurulum için: pip install {' '.join(missing)}")
        sys.exit(1)


check_dependencies()

from sentence_transformers import InputExample, SentenceTransformer, losses  # noqa: E402
from torch.utils.data import DataLoader  # noqa: E402

try:
    from app.embedder import enrich_text
except ImportError as exc:
    print(f"═══ HATA: app.embedder modülü içe aktarılamadı ═══\n{exc}")
    sys.exit(1)


# ─────────────────────────────────────────────────────────────────
# ADIM 2 — veri.csv'yi bölümlere ayır ve çiftleri çıkar
# ─────────────────────────────────────────────────────────────────
def load_sections(csv_path: Path) -> list[list[list[str]]]:
    """CSV'yi 'id' başlıklı satırlara göre bölümlere ayır.

    Her bölüm: [başlık_satırı, veri_satırı1, veri_satırı2, ...]
    csv.reader kullanılır ki tırnaklı alanlar içindeki virgül/satır
    sonu karakterleri yanlış bölünmesin.
    """
    if not csv_path.exists():
        print(f"═══ HATA: veri.csv bulunamadı: {csv_path} ═══")
        sys.exit(1)

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    sections: list[list[list[str]]] = []
    current: list[list[str]] = []
    for row in rows:
        if not row:
            continue  # boş satırları atla
        if row[0].strip().lower() == "id":
            if current:
                sections.append(current)
            current = [row]
        else:
            if not current:
                # 'id' başlığından önce veri varsa yoksay (beklenmedik durum)
                continue
            current.append(row)
    if current:
        sections.append(current)

    if len(sections) != 10:
        print(f"═══ UYARI: 10 bölüm bekleniyordu, {len(sections)} bulundu ═══")

    return sections


def extract_pairs_by_name(
    section: list[list[str]],
    cikti_col: str,
    girdi_col: str,
    etiket_col: str | None = None,
    section_name: str = "",
) -> list[tuple[str, str, float]]:
    """Bir bölümden (çıktı_metin, girdi_metin, etiket) üçlülerini isimle sütun bularak çıkar.

    etiket_col verilmezse tüm satırlar için etiket None döner (çağıran belirler).
    Hatalı/eksik satırlar loglanıp atlanır.
    """
    header = section[0]
    try:
        cikti_idx = header.index(cikti_col)
        girdi_idx = header.index(girdi_col)
        etiket_idx = header.index(etiket_col) if etiket_col else None
    except ValueError as exc:
        print(f"═══ HATA: '{section_name}' bölümünde sütun bulunamadı: {exc} ═══")
        print(f"Mevcut sütunlar: {header}")
        sys.exit(1)

    pairs: list[tuple[str, str, float]] = []
    for i, row in enumerate(section[1:], start=2):
        try:
            if len(row) <= max(cikti_idx, girdi_idx):
                print(f"  [{section_name}] satır {i}: eksik sütun, atlanıyor -> {row}")
                continue
            cikti = row[cikti_idx].strip()
            girdi = row[girdi_idx].strip()
            if not cikti or not girdi:
                print(f"  [{section_name}] satır {i}: boş metin, atlanıyor")
                continue
            etiket = float(row[etiket_idx]) if etiket_idx is not None else None
            pairs.append((cikti, girdi, etiket))
        except (ValueError, IndexError) as exc:
            print(f"  [{section_name}] satır {i}: hata ({exc}), atlanıyor -> {row}")
            continue
    return pairs


def build_dataset(sections: list[list[list[str]]]) -> dict:
    """Tüm bölümlerden pozitif/negatif/sınırda çiftleri topla."""
    try:
        bolum2 = sections[1]   # negatif, 6 sütun
        bolum3 = sections[2]   # pozitif, 8 sütun
        bolum5 = sections[4]   # pozitif, 8 sütun
        bolum6 = sections[5]   # çapraz negatif + sınırda, 7 sütun
        bolum7 = sections[6]   # negatif, 7 sütun
        bolum8 = sections[7]   # pozitif kısa format, 7 sütun
        bolum9 = sections[8]   # çapraz sektör, 8 sütun, 1 ve 0 karışık
        bolum10 = sections[9]  # hard negative, 9 sütun
    except IndexError as exc:
        print(f"═══ HATA: Beklenen bölüm bulunamadı: {exc} ═══")
        sys.exit(1)

    # Pozitif çiftler
    pos_b3 = extract_pairs_by_name(bolum3, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm3")
    pos_b5 = extract_pairs_by_name(bolum5, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm5")
    pos_b8 = extract_pairs_by_name(bolum8, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm8")
    b9_all = extract_pairs_by_name(bolum9, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm9")
    pos_b9 = [(c, g, e) for c, g, e in b9_all if e == 1]
    neg_b9 = [(c, g, e) for c, g, e in b9_all if e == 0]

    # Negatif çiftler
    neg_b2 = extract_pairs_by_name(bolum2, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm2")
    b6_all = extract_pairs_by_name(bolum6, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm6")
    neg_b6 = [(c, g, e) for c, g, e in b6_all if e == 0]
    boundary_b6 = [(c, g, e) for c, g, e in b6_all if e == 0.5]
    neg_b7 = extract_pairs_by_name(bolum7, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm7")
    neg_b10 = extract_pairs_by_name(bolum10, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm10")

    positives = pos_b3 + pos_b5 + pos_b8 + pos_b9
    negatives = neg_b2 + neg_b6 + neg_b7 + neg_b9 + neg_b10

    counts = {
        "bolum2_neg": len(neg_b2),
        "bolum3_pos": len(pos_b3),
        "bolum5_pos": len(pos_b5),
        "bolum6_neg": len(neg_b6),
        "bolum6_boundary": len(boundary_b6),
        "bolum7_neg": len(neg_b7),
        "bolum8_pos": len(pos_b8),
        "bolum9_pos": len(pos_b9),
        "bolum9_neg": len(neg_b9),
        "bolum10_neg": len(neg_b10),
    }

    return {
        "positives": positives,
        "negatives": negatives,
        "boundary": boundary_b6,
        "counts": counts,
    }


# ─────────────────────────────────────────────────────────────────
# ADIM 3 — enrich_text uygula
# ─────────────────────────────────────────────────────────────────
def enrich_pairs(pairs: list[tuple[str, str, float]]) -> list[tuple[str, str, float]]:
    """Her çiftteki iki metni de enrich_text() ile zenginleştir. Boş metinleri atla."""
    enriched = []
    for cikti, girdi, etiket in pairs:
        if not cikti or not girdi:
            continue
        try:
            e_cikti = enrich_text(cikti)
            e_girdi = enrich_text(girdi)
        except Exception as exc:
            print(f"  [enrich] hata: {exc} -> atlanıyor")
            continue
        if not e_cikti or not e_girdi:
            continue
        enriched.append((e_cikti, e_girdi, etiket))
    return enriched


# ─────────────────────────────────────────────────────────────────
# ADIM 4 — Train/validation split (stratified)
# ─────────────────────────────────────────────────────────────────
def stratified_split(
    positives: list[tuple[str, str, float]],
    negatives: list[tuple[str, str, float]],
    test_size: float = TEST_SIZE,
    seed: int = RANDOM_STATE,
) -> tuple[list, list]:
    """Pozitif ve negatif kümeleri ayrı ayrı karıştırıp %80/%20 böl, sonra birleştir."""
    rng = random.Random(seed)

    pos = positives[:]
    neg = negatives[:]
    rng.shuffle(pos)
    rng.shuffle(neg)

    pos_val_n = max(1, round(len(pos) * test_size)) if pos else 0
    neg_val_n = max(1, round(len(neg) * test_size)) if neg else 0

    pos_val, pos_train = pos[:pos_val_n], pos[pos_val_n:]
    neg_val, neg_train = neg[:neg_val_n], neg[neg_val_n:]

    train = pos_train + neg_train
    val = pos_val + neg_val
    rng.shuffle(train)
    rng.shuffle(val)

    return train, val


# ─────────────────────────────────────────────────────────────────
# ADIM 6 — Hızlı doğrulama
# ─────────────────────────────────────────────────────────────────
def quick_eval(
    original_model: SentenceTransformer,
    fine_tuned_model: SentenceTransformer,
    val_pairs: list[tuple[str, str, float]],
    n_pos: int = 5,
    n_neg: int = 5,
) -> dict:
    """Validasyon setinden örnek çiftlerin skorlarını orijinal ve fine-tuned model ile karşılaştır."""
    import numpy as np

    pos_samples = [p for p in val_pairs if p[2] == 1][:n_pos]
    neg_samples = [p for p in val_pairs if p[2] == 0][:n_neg]
    samples = pos_samples + neg_samples

    print("\n═══ HIZLI DOĞRULAMA (Validasyon setinden örnek çiftler) ═══")
    print(f"{'Etiket':<8}{'Orijinal':<12}{'Fine-tuned':<12}{'Değişim':<10}Çift")

    def cos_sim(a, b):
        a = a / (np.linalg.norm(a) + 1e-8)
        b = b / (np.linalg.norm(b) + 1e-8)
        return float(np.dot(a, b))

    for cikti, girdi, etiket in samples:
        orig_a = original_model.encode(cikti)
        orig_b = original_model.encode(girdi)
        ft_a = fine_tuned_model.encode(cikti)
        ft_b = fine_tuned_model.encode(girdi)

        orig_score = cos_sim(orig_a, orig_b)
        ft_score = cos_sim(ft_a, ft_b)
        delta = ft_score - orig_score

        cikti_kisa = (cikti[:30] + "...") if len(cikti) > 30 else cikti
        girdi_kisa = (girdi[:30] + "...") if len(girdi) > 30 else girdi
        print(
            f"{etiket:<8.1f}{orig_score:<12.4f}{ft_score:<12.4f}{delta:+<10.4f}"
            f'"{cikti_kisa}" ↔ "{girdi_kisa}"'
        )

    # Tüm validasyon seti üzerinden ortalamalar
    def avg_scores(model, pairs):
        scores = []
        for cikti, girdi, etiket in pairs:
            a = model.encode(cikti)
            b = model.encode(girdi)
            scores.append(cos_sim(a, b))
        return sum(scores) / len(scores) if scores else 0.0

    all_pos = [p for p in val_pairs if p[2] == 1]
    all_neg = [p for p in val_pairs if p[2] == 0]

    orig_pos_avg = avg_scores(original_model, all_pos)
    orig_neg_avg = avg_scores(original_model, all_neg)
    ft_pos_avg = avg_scores(fine_tuned_model, all_pos)
    ft_neg_avg = avg_scores(fine_tuned_model, all_neg)

    return {
        "orig_pos_avg": orig_pos_avg,
        "orig_neg_avg": orig_neg_avg,
        "ft_pos_avg": ft_pos_avg,
        "ft_neg_avg": ft_neg_avg,
    }


# ─────────────────────────────────────────────────────────────────
# ANA AKIŞ
# ─────────────────────────────────────────────────────────────────
def main() -> None:
    try:
        sections = load_sections(CSV_PATH)
    except Exception as exc:
        print(f"═══ HATA: CSV bölümlere ayrılırken hata oluştu: {exc} ═══")
        sys.exit(1)

    try:
        dataset = build_dataset(sections)
    except Exception as exc:
        print(f"═══ HATA: Çift çıkarma sırasında hata oluştu: {exc} ═══")
        sys.exit(1)

    counts = dataset["counts"]
    positives_raw = dataset["positives"]
    negatives_raw = dataset["negatives"]
    boundary_raw = dataset["boundary"]

    print("═══ VERİ ÖZETİ ═══")
    print(f"Bölüm 2: {counts['bolum2_neg']} negatif çift")
    print(f"Bölüm 3: {counts['bolum3_pos']} pozitif çift")
    print(f"Bölüm 5: {counts['bolum5_pos']} pozitif çift")
    print(f"Bölüm 6: {counts['bolum6_neg']} negatif + {counts['bolum6_boundary']} sınırda çift")
    print(f"Bölüm 7: {counts['bolum7_neg']} negatif çift")
    print(f"Bölüm 8: {counts['bolum8_pos']} pozitif çift")
    print(f"Bölüm 9: {counts['bolum9_pos']} pozitif + {counts['bolum9_neg']} negatif çift")
    print(f"Bölüm 10: {counts['bolum10_neg']} negatif çift")
    print("──────────────────")
    print(f"Toplam pozitif: {len(positives_raw)}")
    print(f"Toplam negatif: {len(negatives_raw)}")
    print(f"Toplam sınırda: {len(boundary_raw)} (eğitime dahil değil)")

    # ADIM 3 — enrich_text uygula
    try:
        positives = enrich_pairs(positives_raw)
        negatives = enrich_pairs(negatives_raw)
    except Exception as exc:
        print(f"═══ HATA: enrich_text uygulanırken hata oluştu: {exc} ═══")
        sys.exit(1)

    if len(positives) < len(positives_raw):
        print(f"  ({len(positives_raw) - len(positives)} pozitif çift enrich sonrası atlandı)")
    if len(negatives) < len(negatives_raw):
        print(f"  ({len(negatives_raw) - len(negatives)} negatif çift enrich sonrası atlandı)")

    # ADIM 4 — split
    try:
        train_data, val_data = stratified_split(positives, negatives)
    except Exception as exc:
        print(f"═══ HATA: Train/val split sırasında hata oluştu: {exc} ═══")
        sys.exit(1)

    print(f"Train: {len(train_data)} çift, Validasyon: {len(val_data)} çift")

    if len(train_data) == 0:
        print("═══ HATA: Eğitim seti boş, devam edilemiyor ═══")
        sys.exit(1)

    # ADIM 5 — Fine-tuning
    print("\n═══ EĞİTİM BAŞLIYOR ═══")
    print(f"Model: {BASE_MODEL_NAME}")

    try:
        original_model = SentenceTransformer(BASE_MODEL_NAME)
    except Exception as exc:
        print(f"═══ HATA: Model yüklenemedi: {exc} ═══")
        sys.exit(1)

    train_examples = [
        InputExample(texts=[cikti, girdi], label=float(etiket))
        for cikti, girdi, etiket in train_data
    ]

    train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=BATCH_SIZE)
    train_loss = losses.CosineSimilarityLoss(original_model)
    warmup_steps = int(len(train_dataloader) * 0.1)

    print(f"Epoch: {EPOCHS}, Batch: {BATCH_SIZE}, Warmup: {warmup_steps}")

    start_time = time.time()
    try:
        original_model.fit(
            train_objectives=[(train_dataloader, train_loss)],
            epochs=EPOCHS,
            warmup_steps=warmup_steps,
            output_path=str(OUTPUT_PATH),
            show_progress_bar=True,
        )
    except Exception as exc:
        print(f"═══ HATA: Eğitim sırasında hata oluştu: {exc} ═══")
        sys.exit(1)
    elapsed_min = (time.time() - start_time) / 60

    # ADIM 6 — Hızlı doğrulama (karşılaştırma için taze bir orijinal model yükle,
    # çünkü fit() sonrası original_model artık fine-tuned durumda)
    try:
        fresh_original = SentenceTransformer(BASE_MODEL_NAME)
        fine_tuned_model = SentenceTransformer(str(OUTPUT_PATH))
        eval_results = quick_eval(fresh_original, fine_tuned_model, val_data)
    except Exception as exc:
        print(f"═══ UYARI: Doğrulama sırasında hata oluştu: {exc} ═══")
        eval_results = None

    # ADIM 7 — Sonuç
    print("\n═══ SONUÇ ═══")
    print(f"Model kaydedildi: {OUTPUT_PATH}")
    print(f"Eğitim süresi: {elapsed_min:.1f} dakika")
    if eval_results:
        print(
            f"Validasyon pozitif ort: orijinal={eval_results['orig_pos_avg']:.2f} "
            f"→ fine-tuned={eval_results['ft_pos_avg']:.2f}"
        )
        print(
            f"Validasyon negatif ort: orijinal={eval_results['orig_neg_avg']:.2f} "
            f"→ fine-tuned={eval_results['ft_neg_avg']:.2f}"
        )


if __name__ == "__main__":
    main()

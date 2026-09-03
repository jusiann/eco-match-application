"""Fine-tuned model değerlendirmesi — orijinal ile karşılaştırma.

veri.csv'deki tüm etiketli çiftleri kullanarak orijinal
(sentence-transformers/all-mpnet-base-v2) ve fine-tuned (./fine_tuned_model)
modelleri kosinüs benzerliği, optimal eşik/F1 ve görsel grafiklerle karşılaştırır.

ÇALIŞTIRMA: python evaluate_finetuned.py
(Bu script sadece OLUŞTURULMUŞTUR — kullanıcı kendisi çalıştıracaktır.)
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

# Windows konsolda Türkçe karakterlerin doğru basılması için
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sentence_transformers import SentenceTransformer  # noqa: E402

try:
    from app.embedder import enrich_text
except ImportError as exc:
    print(f"═══ HATA: app.embedder modülü içe aktarılamadı ═══\n{exc}")
    sys.exit(1)

CSV_PATH = Path(__file__).parent / "veri.csv"
ORIGINAL_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
FINETUNED_MODEL_PATH = Path(__file__).parent / "fine_tuned_model"

# Renk paleti
COLOR_POS = "#1D9E75"
COLOR_NEG = "#D64545"
COLOR_BOUNDARY = "#E6A817"
COLOR_ORIG = "#378ADD"
COLOR_FT = "#1D9E75"

DPI = 150


# ─────────────────────────────────────────────────────────────────
# CSV parse — fine_tune.py ile aynı mantık
# ─────────────────────────────────────────────────────────────────
def load_sections(csv_path: Path) -> list[list[list[str]]]:
    """CSV'yi 'id' başlıklı satırlara göre bölümlere ayır."""
    if not csv_path.exists():
        print(f"═══ HATA: veri.csv bulunamadı: {csv_path} ═══")
        sys.exit(1)

    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    sections: list[list[list[str]]] = []
    current: list[list[str]] = []
    for row in rows:
        if not row:
            continue
        if row[0].strip().lower() == "id":
            if current:
                sections.append(current)
            current = [row]
        else:
            if not current:
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
    etiket_col: str,
    section_name: str = "",
) -> list[tuple[str, str, float]]:
    """Bir bölümden (çıktı_metin, girdi_metin, etiket) üçlülerini isimle sütun bularak çıkar."""
    header = section[0]
    try:
        cikti_idx = header.index(cikti_col)
        girdi_idx = header.index(girdi_col)
        etiket_idx = header.index(etiket_col)
    except ValueError as exc:
        print(f"═══ HATA: '{section_name}' bölümünde sütun bulunamadı: {exc} ═══")
        print(f"Mevcut sütunlar: {header}")
        sys.exit(1)

    pairs: list[tuple[str, str, float]] = []
    for i, row in enumerate(section[1:], start=2):
        try:
            if len(row) <= max(cikti_idx, girdi_idx, etiket_idx):
                print(f"  [{section_name}] satır {i}: eksik sütun, atlanıyor -> {row}")
                continue
            cikti = row[cikti_idx].strip()
            girdi = row[girdi_idx].strip()
            if not cikti or not girdi:
                print(f"  [{section_name}] satır {i}: boş metin, atlanıyor")
                continue
            etiket = float(row[etiket_idx])
            pairs.append((cikti, girdi, etiket))
        except (ValueError, IndexError) as exc:
            print(f"  [{section_name}] satır {i}: hata ({exc}), atlanıyor -> {row}")
            continue
    return pairs


def build_dataset(sections: list[list[list[str]]]) -> dict:
    """Tüm bölümlerden pozitif/negatif/sınırda çiftleri, bölüm etiketiyle birlikte topla."""
    try:
        bolum2 = sections[1]
        bolum3 = sections[2]
        bolum5 = sections[4]
        bolum6 = sections[5]
        bolum7 = sections[6]
        bolum8 = sections[7]
        bolum9 = sections[8]
        bolum10 = sections[9]
    except IndexError as exc:
        print(f"═══ HATA: Beklenen bölüm bulunamadı: {exc} ═══")
        sys.exit(1)

    def tag(pairs, name):
        return [(c, g, e, name) for c, g, e in pairs]

    pos_b3 = tag(extract_pairs_by_name(bolum3, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm3"), "Bölüm3")
    pos_b5 = tag(extract_pairs_by_name(bolum5, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm5"), "Bölüm5")
    pos_b8 = tag(extract_pairs_by_name(bolum8, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm8"), "Bölüm8")
    b9_all = extract_pairs_by_name(bolum9, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm9")
    pos_b9 = [(c, g, e, "Bölüm9") for c, g, e in b9_all if e == 1]
    neg_b9 = [(c, g, e, "Bölüm9") for c, g, e in b9_all if e == 0]

    neg_b2 = tag(extract_pairs_by_name(bolum2, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm2"), "Bölüm2")
    b6_all = extract_pairs_by_name(bolum6, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm6")
    neg_b6 = [(c, g, e, "Bölüm6") for c, g, e in b6_all if e == 0]
    boundary_b6 = [(c, g, e, "Bölüm6") for c, g, e in b6_all if e == 0.5]
    neg_b7 = tag(extract_pairs_by_name(bolum7, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm7"), "Bölüm7")
    neg_b10 = tag(extract_pairs_by_name(bolum10, "cikti_tanim", "girdi_tanim", "etiket", "Bölüm10"), "Bölüm10")

    positives = pos_b3 + pos_b5 + pos_b8 + pos_b9
    negatives = neg_b2 + neg_b6 + neg_b7 + neg_b9 + neg_b10

    by_section: dict[str, list] = {}
    for c, g, e, sec in positives + negatives + boundary_b6:
        by_section.setdefault(sec, []).append((c, g, e))

    return {
        "positives": positives,
        "negatives": negatives,
        "boundary": boundary_b6,
        "by_section": by_section,
    }


def enrich_pairs(pairs: list[tuple]) -> list[tuple]:
    """Her çiftteki iki metni de enrich_text() ile zenginleştir. Boş metinleri atla."""
    enriched = []
    for item in pairs:
        cikti, girdi = item[0], item[1]
        rest = item[2:]
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
        enriched.append((e_cikti, e_girdi, *rest))
    return enriched


# ─────────────────────────────────────────────────────────────────
# Kosinüs benzerliği
# ─────────────────────────────────────────────────────────────────
def cosine(a, b) -> float:
    a, b = np.array(a), np.array(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def score_pairs(model: SentenceTransformer, pairs: list[tuple]) -> list[float]:
    """Bir çift listesindeki her (cikti, girdi, ...) için kosinüs benzerliği hesapla."""
    scores = []
    for item in pairs:
        cikti, girdi = item[0], item[1]
        a = model.encode(cikti)
        b = model.encode(girdi)
        scores.append(cosine(a, b))
    return scores


# ─────────────────────────────────────────────────────────────────
# Optimal eşik / F1 arama
# ─────────────────────────────────────────────────────────────────
def find_optimal_threshold(pos_scores: list[float], neg_scores: list[float]) -> dict:
    """0.30-0.95 arası 0.01 adımla en yüksek F1'i veren eşiği bul."""
    best = {"threshold": 0.0, "f1": -1.0, "precision": 0.0, "recall": 0.0}
    thresholds = np.arange(0.30, 0.95 + 1e-9, 0.01)
    for t in thresholds:
        tp = sum(1 for s in pos_scores if s >= t)
        fn = len(pos_scores) - tp
        fp = sum(1 for s in neg_scores if s >= t)
        tn = len(neg_scores) - fp

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        if f1 > best["f1"]:
            best = {"threshold": round(float(t), 2), "f1": f1, "precision": precision, "recall": recall}
    return best


# ─────────────────────────────────────────────────────────────────
# Grafik 1 — Skor dağılımı histogramları
# ─────────────────────────────────────────────────────────────────
def plot_distributions(
    orig_pos, orig_neg, ft_pos, ft_neg, orig_threshold, ft_threshold, out_path: Path
) -> None:
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    ax = axes[0]
    ax.hist(orig_pos, bins=20, alpha=0.6, color=COLOR_POS, label="Pozitif")
    ax.hist(orig_neg, bins=20, alpha=0.6, color=COLOR_NEG, label="Negatif")
    ax.axvline(orig_threshold, color="black", linestyle="--", linewidth=1.5, label=f"Optimal eşik={orig_threshold:.2f}")
    ax.set_title("Orijinal Model")
    ax.set_xlabel("Kosinüs benzerliği")
    ax.set_ylabel("Frekans")
    ax.legend()

    ax = axes[1]
    ax.hist(ft_pos, bins=20, alpha=0.6, color=COLOR_POS, label="Pozitif")
    ax.hist(ft_neg, bins=20, alpha=0.6, color=COLOR_NEG, label="Negatif")
    ax.axvline(ft_threshold, color="black", linestyle="--", linewidth=1.5, label=f"Optimal eşik={ft_threshold:.2f}")
    ax.set_title("Fine-Tuned Model")
    ax.set_xlabel("Kosinüs benzerliği")
    ax.set_ylabel("Frekans")
    ax.legend()

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────
# Grafik 2 — F1 eğrisi karşılaştırması
# ─────────────────────────────────────────────────────────────────
def plot_f1_curves(orig_pos, orig_neg, ft_pos, ft_neg, orig_best, ft_best, out_path: Path) -> None:
    thresholds = np.arange(0.30, 0.95 + 1e-9, 0.01)

    def f1_curve(pos_scores, neg_scores):
        f1s = []
        for t in thresholds:
            tp = sum(1 for s in pos_scores if s >= t)
            fn = len(pos_scores) - tp
            fp = sum(1 for s in neg_scores if s >= t)
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
            f1s.append(f1)
        return f1s

    orig_f1s = f1_curve(orig_pos, orig_neg)
    ft_f1s = f1_curve(ft_pos, ft_neg)

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.plot(thresholds, orig_f1s, linestyle="--", color=COLOR_ORIG, linewidth=2, label="Orijinal F1")
    ax.plot(thresholds, ft_f1s, linestyle="-", color=COLOR_FT, linewidth=2.5, label="Fine-Tuned F1")
    ax.axvline(orig_best["threshold"], color=COLOR_ORIG, linestyle=":", linewidth=1.5,
               label=f"Orijinal optimal={orig_best['threshold']:.2f} (F1={orig_best['f1']:.3f})")
    ax.axvline(ft_best["threshold"], color=COLOR_FT, linestyle=":", linewidth=1.5,
               label=f"Fine-tuned optimal={ft_best['threshold']:.2f} (F1={ft_best['f1']:.3f})")
    ax.set_title("F1 Score Karşılaştırması — Orijinal vs Fine-Tuned")
    ax.set_xlabel("Eşik değeri")
    ax.set_ylabel("F1 Score")
    ax.legend()
    ax.grid(alpha=0.3)

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────
# Grafik 3 — Çift bazlı scatter
# ─────────────────────────────────────────────────────────────────
def plot_scatter(all_orig, all_ft, all_labels, out_path: Path) -> None:
    all_orig = np.array(all_orig)
    all_ft = np.array(all_ft)
    all_labels = np.array(all_labels)

    fig, ax = plt.subplots(figsize=(8, 8))

    mask_pos = all_labels == 1
    mask_neg = all_labels == 0
    mask_boundary = all_labels == 0.5

    ax.scatter(all_orig[mask_pos], all_ft[mask_pos], color=COLOR_POS, alpha=0.6, label="Pozitif", s=30)
    ax.scatter(all_orig[mask_neg], all_ft[mask_neg], color=COLOR_NEG, alpha=0.6, label="Negatif", s=30)
    if mask_boundary.any():
        ax.scatter(all_orig[mask_boundary], all_ft[mask_boundary], color=COLOR_BOUNDARY, alpha=0.6, label="Sınırda", s=30)

    lims = [0.0, 1.0]
    ax.plot(lims, lims, color="black", linestyle="--", linewidth=1, label="y=x (değişim yok)")

    ax.set_xlim(lims)
    ax.set_ylim(lims)
    ax.set_xlabel("Orijinal model skoru")
    ax.set_ylabel("Fine-tuned model skoru")
    ax.set_title("Çift Bazlı Skor Değişimi")
    ax.legend(loc="upper left")
    ax.set_aspect("equal")

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────
# Grafik 4 — Özet tablo
# ─────────────────────────────────────────────────────────────────
def plot_summary_table(metrics: list[tuple], out_path: Path) -> None:
    """metrics: (isim, orig_deger, ft_deger, iyilesme_mi) listesi."""
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.axis("off")

    col_labels = ["Metrik", "Orijinal", "Fine-tuned", "Değişim"]
    cell_text = []
    cell_colors = []
    for name, orig_val, ft_val, is_improvement in metrics:
        if orig_val is None:
            delta_str = ""
        else:
            delta = ft_val - orig_val
            delta_str = f"{delta:+.3f}"
        cell_text.append([name, f"{orig_val:.3f}" if orig_val is not None else "-", f"{ft_val:.3f}", delta_str])
        if is_improvement is None:
            row_color = "#FFFFFF"
        elif is_improvement:
            row_color = "#D4F1E4"  # açık yeşil
        else:
            row_color = "#F9D5D5"  # açık kırmızı
        cell_colors.append([row_color] * 4)

    table = ax.table(cellText=cell_text, colLabels=col_labels, cellColours=cell_colors,
                      loc="center", cellLoc="center")
    table.auto_set_font_size(False)
    table.set_fontsize(11)
    table.scale(1, 2)

    ax.set_title("Fine-Tuning Etki Analizi", fontsize=14, weight="bold", pad=20)

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────
# ANA AKIŞ
# ─────────────────────────────────────────────────────────────────
def main() -> None:
    if not FINETUNED_MODEL_PATH.exists():
        print(f"═══ HATA: Fine-tuned model bulunamadı: {FINETUNED_MODEL_PATH} ═══")
        sys.exit(1)

    # ADIM 1 — Modelleri yükle
    print("═══ MODELLER YÜKLENİYOR ═══")
    try:
        original_model = SentenceTransformer(ORIGINAL_MODEL_NAME)
        finetuned_model = SentenceTransformer(str(FINETUNED_MODEL_PATH))
    except Exception as exc:
        print(f"═══ HATA: Model yüklenemedi: {exc} ═══")
        sys.exit(1)
    print("Modeller yüklendi.\n")

    # ADIM 2 — Veri çıkar + enrich
    try:
        sections = load_sections(CSV_PATH)
        dataset = build_dataset(sections)
    except Exception as exc:
        print(f"═══ HATA: Veri çıkarılırken hata oluştu: {exc} ═══")
        sys.exit(1)

    try:
        positives = enrich_pairs(dataset["positives"])
        negatives = enrich_pairs(dataset["negatives"])
        boundary = enrich_pairs(dataset["boundary"])
        by_section = {
            name: enrich_pairs(pairs) for name, pairs in dataset["by_section"].items()
        }
    except Exception as exc:
        print(f"═══ HATA: enrich_text uygulanırken hata oluştu: {exc} ═══")
        sys.exit(1)

    print(f"Toplam pozitif çift: {len(positives)}")
    print(f"Toplam negatif çift: {len(negatives)}")
    print(f"Toplam sınırda çift: {len(boundary)}\n")

    # ADIM 3 — Skorlama
    print("═══ SKORLAMA (bu biraz sürebilir) ═══")
    try:
        orig_pos_scores = score_pairs(original_model, positives)
        orig_neg_scores = score_pairs(original_model, negatives)
        orig_boundary_scores = score_pairs(original_model, boundary) if boundary else []

        ft_pos_scores = score_pairs(finetuned_model, positives)
        ft_neg_scores = score_pairs(finetuned_model, negatives)
        ft_boundary_scores = score_pairs(finetuned_model, boundary) if boundary else []
    except Exception as exc:
        print(f"═══ HATA: Skorlama sırasında hata oluştu: {exc} ═══")
        sys.exit(1)
    print("Skorlama tamamlandı.\n")

    # ADIM 5 — Optimal eşik / F1
    orig_best = find_optimal_threshold(orig_pos_scores, orig_neg_scores)
    ft_best = find_optimal_threshold(ft_pos_scores, ft_neg_scores)

    orig_pos_avg = float(np.mean(orig_pos_scores)) if orig_pos_scores else 0.0
    orig_neg_avg = float(np.mean(orig_neg_scores)) if orig_neg_scores else 0.0
    ft_pos_avg = float(np.mean(ft_pos_scores)) if ft_pos_scores else 0.0
    ft_neg_avg = float(np.mean(ft_neg_scores)) if ft_neg_scores else 0.0

    orig_boundary_avg = float(np.mean(orig_boundary_scores)) if orig_boundary_scores else 0.0
    ft_boundary_avg = float(np.mean(ft_boundary_scores)) if ft_boundary_scores else 0.0

    orig_separation = orig_pos_avg - orig_neg_avg
    ft_separation = ft_pos_avg - ft_neg_avg

    # ADIM 4 — Konsol tablosu
    def fmt_delta(orig_val, ft_val):
        delta = ft_val - orig_val
        return f"{delta:+.3f}"

    print("═══ KARŞILAŞTIRMA TABLOSU ═══")
    print(f"{'Metrik':<22}{'Orijinal':<14}{'Fine-tuned':<14}{'Değişim':<10}")
    print("-" * 60)
    print(f"{'Pozitif ort. skor':<22}{orig_pos_avg:<14.3f}{ft_pos_avg:<14.3f}{fmt_delta(orig_pos_avg, ft_pos_avg):<10}")
    print(f"{'Negatif ort. skor':<22}{orig_neg_avg:<14.3f}{ft_neg_avg:<14.3f}{fmt_delta(orig_neg_avg, ft_neg_avg):<10}")
    print(f"{'Ayrım (poz-neg)':<22}{orig_separation:<14.3f}{ft_separation:<14.3f}{fmt_delta(orig_separation, ft_separation):<10}")
    print(f"{'Sınırda ort. skor':<22}{orig_boundary_avg:<14.3f}{ft_boundary_avg:<14.3f}{fmt_delta(orig_boundary_avg, ft_boundary_avg):<10}")
    print(f"{'Optimal eşik':<22}{orig_best['threshold']:<14.2f}{ft_best['threshold']:<14.2f}")
    print(f"{'Optimal F1':<22}{orig_best['f1']:<14.3f}{ft_best['f1']:<14.3f}{fmt_delta(orig_best['f1'], ft_best['f1']):<10}")
    print(f"{'Precision@optimal':<22}{orig_best['precision']:<14.3f}{ft_best['precision']:<14.3f}")
    print(f"{'Recall@optimal':<22}{orig_best['recall']:<14.3f}{ft_best['recall']:<14.3f}")
    print()

    # ADIM 6 — Grafikler
    print("═══ GRAFİKLER ÜRETİLİYOR ═══")
    try:
        plot_distributions(
            orig_pos_scores, orig_neg_scores, ft_pos_scores, ft_neg_scores,
            orig_best["threshold"], ft_best["threshold"],
            Path(__file__).parent / "g_ft_1_dagilim.png",
        )
        plot_f1_curves(
            orig_pos_scores, orig_neg_scores, ft_pos_scores, ft_neg_scores,
            orig_best, ft_best,
            Path(__file__).parent / "g_ft_2_f1.png",
        )

        all_pairs = positives + negatives + boundary
        all_orig_scores = orig_pos_scores + orig_neg_scores + orig_boundary_scores
        all_ft_scores = ft_pos_scores + ft_neg_scores + ft_boundary_scores
        all_labels = [p[2] for p in all_pairs]
        plot_scatter(all_orig_scores, all_ft_scores, all_labels, Path(__file__).parent / "g_ft_3_scatter.png")

        summary_metrics = [
            ("Pozitif ort. skor", orig_pos_avg, ft_pos_avg, ft_pos_avg > orig_pos_avg),
            ("Negatif ort. skor", orig_neg_avg, ft_neg_avg, ft_neg_avg < orig_neg_avg),
            ("Ayrım (poz-neg)", orig_separation, ft_separation, ft_separation > orig_separation),
            ("Optimal F1", orig_best["f1"], ft_best["f1"], ft_best["f1"] > orig_best["f1"]),
            ("Precision@optimal", orig_best["precision"], ft_best["precision"], ft_best["precision"] > orig_best["precision"]),
            ("Recall@optimal", orig_best["recall"], ft_best["recall"], ft_best["recall"] > orig_best["recall"]),
        ]
        plot_summary_table(summary_metrics, Path(__file__).parent / "g_ft_4_ozet.png")
    except Exception as exc:
        print(f"═══ UYARI: Grafik üretiminde hata oluştu: {exc} ═══")
    print("Grafikler kaydedildi: g_ft_1_dagilim.png, g_ft_2_f1.png, g_ft_3_scatter.png, g_ft_4_ozet.png\n")

    # ADIM 7 — Bölüm bazlı analiz
    print("═══ BÖLÜM BAZLI ANALİZ ═══")
    section_order = ["Bölüm2", "Bölüm3", "Bölüm5", "Bölüm6", "Bölüm7", "Bölüm8", "Bölüm9", "Bölüm10"]
    for name in section_order:
        pairs = by_section.get(name)
        if not pairs:
            continue
        try:
            o_scores = score_pairs(original_model, pairs)
            f_scores = score_pairs(finetuned_model, pairs)
        except Exception as exc:
            print(f"  [{name}] skorlama hatası: {exc}")
            continue
        o_avg = float(np.mean(o_scores))
        f_avg = float(np.mean(f_scores))
        etiketler = {p[2] for p in pairs}
        etiket_str = "/".join(sorted(str(e) for e in etiketler))
        note = ""
        if name == "Bölüm8":
            note = "  <- kısa format, iyileşme kritik"
        elif name == "Bölüm10":
            note = "  <- hard negative, ayrım kritik"
        print(f"  {name} (etiket={etiket_str}, n={len(pairs)}): orijinal={o_avg:.3f} -> fine-tuned={f_avg:.3f} ({f_avg - o_avg:+.3f}){note}")
    print()

    # ADIM 8 — Karar önerisi
    print("═══ KARAR ÖNERİSİ ═══")
    ft_f1 = ft_best["f1"]
    orig_f1 = orig_best["f1"]
    if ft_f1 > 0.75:
        print("✅ Fine-tuned model güçlü. MVP için kullanılabilir.")
    elif ft_f1 > orig_f1 * 1.15:
        print("⚠️ Belirgin iyileşme var ama BM25 hibrit eklemek güvenliği artırır.")
    else:
        print("❌ Yeterli iyileşme yok. Veri kalitesini kontrol et veya farklı strateji dene.")


if __name__ == "__main__":
    main()

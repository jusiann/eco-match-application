"""DöngüNet AI — Sunum Grafikleri.

Yatırımcı/paydaş sunumu için 6 profesyonel grafik üretir (projeksiyon için
büyük fontlarla). İki grup grafik var:
  - Statik diyagramlar (mimari, pipeline, teknoloji tablosu) — veri gerektirmez.
  - Veri odaklı grafikler (öncesi/sonrası, confusion matrix, eşik/F1) —
    veri.csv + orijinal/fine-tuned modeller üzerinden CANLI hesaplanır.

ÇALIŞTIRMA: python presentation_graphs.py
(Bu script sadece OLUŞTURULMUŞTUR — kullanıcı kendisi çalıştıracaktır.)
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch  # noqa: E402
import numpy as np  # noqa: E402
import seaborn as sns  # noqa: E402
from sentence_transformers import SentenceTransformer  # noqa: E402

try:
    from app.embedder import enrich_text
    from app.classifier import CATEGORY_EXAMPLES
except ImportError as exc:
    print(f"═══ HATA: app modülleri içe aktarılamadı: {exc} ═══")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "veri.csv"
ORIGINAL_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
FINETUNED_MODEL_PATH = ROOT / "fine_tuned_model"

# --- Renk paleti (tutarlı) ----------------------------------------------------

YESIL = "#1D9E75"
MAVI = "#378ADD"
KIRMIZI = "#D64545"
GRI = "#6B7280"
SARI = "#E6A817"

DPI = 200
FS_BASLIK = 18
FS_ETIKET = 14


# ═══════════════════════════════════════════════════════════════════════════
# GRAFİK 1 — Mimari diyagramı (veri gerektirmez)
# ═══════════════════════════════════════════════════════════════════════════

def cizim1_mimari(out_path: Path) -> None:
    """[Kullanıcı] → [Frontend] → [Backend] → [AI Mikroservis] akışını çizer.

    AI Mikroservis kutusunun içinde SBERT, Classifier, BM25 ve pgvector alt
    bileşenleri ayrı renklerde gösterilir.
    """
    fig, ax = plt.subplots(figsize=(16, 9))
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 9)
    ax.axis("off")
    ax.set_title("DöngüNet AI — Sistem Mimarisi", fontsize=FS_BASLIK, weight="bold", pad=20)

    def kutu(x, y, w, h, metin, renk, fontsize=FS_ETIKET, text_color="white"):
        box = FancyBboxPatch(
            (x, y), w, h,
            boxstyle="round,pad=0.08,rounding_size=0.12",
            linewidth=1.5, edgecolor=renk, facecolor=renk, alpha=0.85,
        )
        ax.add_patch(box)
        ax.text(x + w / 2, y + h / 2, metin, ha="center", va="center",
                 fontsize=fontsize, weight="bold", color=text_color, wrap=True)
        return box

    def ok(x1, y1, x2, y2):
        arrow = FancyArrowPatch(
            (x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=25,
            linewidth=2, color="#333333",
        )
        ax.add_patch(arrow)

    # Ana akış kutuları
    kutu(0.3, 3.5, 2.2, 2, "Kullanıcı", MAVI)
    kutu(3.3, 3.5, 2.2, 2, "Frontend", MAVI)
    kutu(6.3, 3.5, 2.2, 2, "Backend", GRI)

    # AI Mikroservis çerçevesi
    cerceve = FancyBboxPatch(
        (9.3, 0.8), 6.3, 7.4,
        boxstyle="round,pad=0.1,rounding_size=0.15",
        linewidth=2.5, edgecolor="#333333", facecolor="#F2F2F2",
    )
    ax.add_patch(cerceve)
    ax.text(12.45, 7.7, "AI Mikroservis", ha="center", va="center",
             fontsize=FS_ETIKET + 2, weight="bold", color="#333333")

    # Alt bileşenler (2x2)
    kutu(9.7, 5.3, 2.6, 1.7, "SBERT\n(fine-tuned)", YESIL)
    kutu(12.7, 5.3, 2.6, 1.7, "Classifier\n(prototip)", MAVI)
    kutu(9.7, 3.0, 2.6, 1.7, "BM25\n(hibrit)", SARI, text_color="#333333")
    kutu(12.7, 3.0, 2.6, 1.7, "pgvector\n(PostgreSQL)", KIRMIZI)

    # Ana akış okları
    ok(2.5, 4.5, 3.3, 4.5)
    ok(5.5, 4.5, 6.3, 4.5)
    ok(8.5, 4.5, 9.3, 4.5)

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ═══════════════════════════════════════════════════════════════════════════
# GRAFİK 2 — Eşleştirme pipeline akışı (veri gerektirmez)
# ═══════════════════════════════════════════════════════════════════════════

def cizim2_pipeline(out_path: Path) -> None:
    """Metin → enrich_text → SBERT → pgvector → BM25 hibrit → sıralı sonuç."""
    asamalar = [
        ("Metin", "Ham girdi metni", GRI),
        ("enrich_text", "Kısaltma + jargon açılımı", MAVI),
        ("SBERT", "768D anlamsal vektör", YESIL),
        ("pgvector", "HNSW komşu araması", KIRMIZI),
        ("BM25 hibrit", "Anahtar kelime + anlam karışımı", SARI),
        ("Sıralı sonuç", "Skorlanmış öneri listesi", YESIL),
    ]

    fig, ax = plt.subplots(figsize=(16, 6))
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 6)
    ax.axis("off")
    ax.set_title("Eşleştirme Pipeline Akışı", fontsize=FS_BASLIK, weight="bold", pad=20)

    n = len(asamalar)
    kutu_genislik = 2.2
    bosluk = (16 - n * kutu_genislik) / (n + 1)
    y_kutu = 3.2
    kutu_yukseklik = 1.6

    for i, (baslik_metin, aciklama, renk) in enumerate(asamalar):
        x = bosluk + i * (kutu_genislik + bosluk)
        text_color = "#333333" if renk == SARI else "white"
        box = FancyBboxPatch(
            (x, y_kutu), kutu_genislik, kutu_yukseklik,
            boxstyle="round,pad=0.08,rounding_size=0.12",
            linewidth=1.5, edgecolor=renk, facecolor=renk, alpha=0.85,
        )
        ax.add_patch(box)
        ax.text(x + kutu_genislik / 2, y_kutu + kutu_yukseklik / 2, baslik_metin,
                 ha="center", va="center", fontsize=FS_ETIKET, weight="bold", color=text_color)
        ax.text(x + kutu_genislik / 2, y_kutu - 0.5, aciklama,
                 ha="center", va="top", fontsize=10, color="#333333", wrap=True)

        if i < n - 1:
            x2 = bosluk + (i + 1) * (kutu_genislik + bosluk)
            arrow = FancyArrowPatch(
                (x + kutu_genislik, y_kutu + kutu_yukseklik / 2),
                (x2, y_kutu + kutu_yukseklik / 2),
                arrowstyle="-|>", mutation_scale=22, linewidth=2, color="#333333",
            )
            ax.add_patch(arrow)

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ═══════════════════════════════════════════════════════════════════════════
# Ortak veri yükleme — veri.csv'yi bölümlere ayır (evaluate_finetuned.py ile
# aynı mantık, bu scriptin bağımsız çalışabilmesi için burada tekrarlanmıştır)
# ═══════════════════════════════════════════════════════════════════════════

def _load_sections(csv_path: Path) -> list[list[list[str]]]:
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
    return sections


def _extract_pairs(section: list[list[str]], cikti_col: str, girdi_col: str,
                    etiket_col: str) -> list[tuple[str, str, float]]:
    header = section[0]
    try:
        cikti_idx = header.index(cikti_col)
        girdi_idx = header.index(girdi_col)
        etiket_idx = header.index(etiket_col)
    except ValueError:
        return []

    pairs: list[tuple[str, str, float]] = []
    for row in section[1:]:
        try:
            if len(row) <= max(cikti_idx, girdi_idx, etiket_idx):
                continue
            cikti = row[cikti_idx].strip()
            girdi = row[girdi_idx].strip()
            if not cikti or not girdi:
                continue
            etiket = float(row[etiket_idx])
            pairs.append((cikti, girdi, etiket))
        except (ValueError, IndexError):
            continue
    return pairs


def _build_pos_neg(sections: list[list[list[str]]]) -> tuple[list, list]:
    """Bölüm3/5/8/9(etiket=1) pozitif, Bölüm2/6(etiket=0)/7/9(etiket=0)/10 negatif."""
    try:
        bolum2, bolum3, bolum5, bolum6, bolum7 = sections[1], sections[2], sections[4], sections[5], sections[6]
        bolum8, bolum9, bolum10 = sections[7], sections[8], sections[9]
    except IndexError:
        print("═══ UYARI: veri.csv beklenen bölüm sayısına sahip değil ═══")
        return [], []

    positives = (
        _extract_pairs(bolum3, "cikti_tanim", "girdi_tanim", "etiket")
        + _extract_pairs(bolum5, "cikti_tanim", "girdi_tanim", "etiket")
        + _extract_pairs(bolum8, "cikti_tanim", "girdi_tanim", "etiket")
    )
    b9 = _extract_pairs(bolum9, "cikti_tanim", "girdi_tanim", "etiket")
    positives += [(c, g, e) for c, g, e in b9 if e == 1]

    b6 = _extract_pairs(bolum6, "cikti_tanim", "girdi_tanim", "etiket")
    negatives = (
        _extract_pairs(bolum2, "cikti_tanim", "girdi_tanim", "etiket")
        + [(c, g, e) for c, g, e in b6 if e == 0]
        + _extract_pairs(bolum7, "cikti_tanim", "girdi_tanim", "etiket")
        + [(c, g, e) for c, g, e in b9 if e == 0]
        + _extract_pairs(bolum10, "cikti_tanim", "girdi_tanim", "etiket")
    )
    return positives, negatives


def _enrich_pairs(pairs: list[tuple]) -> list[tuple]:
    enriched = []
    for cikti, girdi, etiket in pairs:
        try:
            enriched.append((enrich_text(cikti), enrich_text(girdi), etiket))
        except Exception:
            continue
    return enriched


def _cosine(a, b) -> float:
    a, b = np.array(a), np.array(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom else 0.0


def _score_pairs(model: SentenceTransformer, pairs: list[tuple]) -> list[float]:
    return [_cosine(model.encode(c), model.encode(g)) for c, g, _ in pairs]


def _find_optimal_threshold(pos_scores: list[float], neg_scores: list[float]) -> dict:
    best = {"threshold": 0.0, "f1": -1.0, "precision": 0.0, "recall": 0.0}
    for t in np.arange(0.30, 0.95 + 1e-9, 0.01):
        tp = sum(1 for s in pos_scores if s >= t)
        fn = len(pos_scores) - tp
        fp = sum(1 for s in neg_scores if s >= t)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        if f1 > best["f1"]:
            best = {"threshold": round(float(t), 2), "f1": f1, "precision": precision, "recall": recall}
    return best


# ═══════════════════════════════════════════════════════════════════════════
# GRAFİK 3 — Fine-tuning öncesi vs sonrası
# ═══════════════════════════════════════════════════════════════════════════

def cizim3_oncesi_sonrasi(orig_model, ft_model, positives, negatives, out_path: Path) -> None:
    """Grouped bar chart: Pozitif ort, Negatif ort, F1, Ayrım — orijinal (kırmızı) vs fine-tuned (yeşil)."""
    orig_pos = _score_pairs(orig_model, positives)
    orig_neg = _score_pairs(orig_model, negatives)
    ft_pos = _score_pairs(ft_model, positives)
    ft_neg = _score_pairs(ft_model, negatives)

    orig_best = _find_optimal_threshold(orig_pos, orig_neg)
    ft_best = _find_optimal_threshold(ft_pos, ft_neg)

    orig_pos_avg, orig_neg_avg = float(np.mean(orig_pos)), float(np.mean(orig_neg))
    ft_pos_avg, ft_neg_avg = float(np.mean(ft_pos)), float(np.mean(ft_neg))
    orig_ayrim = orig_pos_avg - orig_neg_avg
    ft_ayrim = ft_pos_avg - ft_neg_avg

    metrikler = ["Pozitif ort.", "Negatif ort.", "F1", "Ayrım"]
    orig_degerler = [orig_pos_avg, orig_neg_avg, orig_best["f1"], orig_ayrim]
    ft_degerler = [ft_pos_avg, ft_neg_avg, ft_best["f1"], ft_ayrim]

    x = np.arange(len(metrikler))
    genislik = 0.35

    fig, ax = plt.subplots(figsize=(14, 7))
    # Sol bar: orijinal (kırmızı tonları), sağ bar: fine-tuned (yeşil tonları)
    bar1 = ax.bar(x - genislik / 2, orig_degerler, genislik, label="Orijinal Model",
                   color=KIRMIZI, alpha=0.85)
    bar2 = ax.bar(x + genislik / 2, ft_degerler, genislik, label="Fine-Tuned Model",
                   color=YESIL, alpha=0.85)

    ax.bar_label(bar1, fmt="%.3f", fontsize=11, padding=3)
    ax.bar_label(bar2, fmt="%.3f", fontsize=11, padding=3)

    ax.set_xticks(x)
    ax.set_xticklabels(metrikler, fontsize=FS_ETIKET)
    ax.set_ylabel("Değer", fontsize=FS_ETIKET)
    ax.set_title("Model İyileştirme Etkisi", fontsize=FS_BASLIK, weight="bold", pad=20)
    ax.legend(fontsize=FS_ETIKET - 1)
    ax.grid(axis="y", alpha=0.3)

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ═══════════════════════════════════════════════════════════════════════════
# GRAFİK 4 — Confusion matrix (fine-tuned, 7×7)
# ═══════════════════════════════════════════════════════════════════════════

KATEGORI_HARITASI = {
    "METAL": "METAL",
    "PLASTİK": "PLASTIK", "PLASTIK": "PLASTIK",
    "ORGANİK": "ORGANIK", "ORGANIK": "ORGANIK",
    "KİMYASAL": "KIMYASAL", "KIMYASAL": "KIMYASAL",
    "TEKSTİL": "TEKSTIL", "TEKSTIL": "TEKSTIL",
    "CAM": "CAM",
    "KAĞIT": "KAGIT", "KAGIT": "KAGIT",
}


def _normalize_kategori(kategori: str) -> str:
    return KATEGORI_HARITASI.get(kategori.strip(), kategori.strip())


def cizim4_confusion_matrix(ft_model, out_path: Path) -> None:
    """veri.csv Bölüm 1'i (kategori, tanim) fine-tuned modelle prototip
    tabanlı sınıflandırır ve 7x7 confusion matrix çizer."""
    sections = _load_sections(CSV_PATH)
    bolum1 = sections[0] if sections else []
    if not bolum1:
        print("═══ UYARI: Bölüm 1 (sınıflandırma verisi) bulunamadı, Grafik 4 atlanıyor ═══")
        return

    header = bolum1[0]
    try:
        kategori_idx = header.index("kategori")
        tanim_idx = header.index("tanim")
    except ValueError:
        print("═══ UYARI: Bölüm 1'de 'kategori'/'tanim' sütunu yok, Grafik 4 atlanıyor ═══")
        return

    ornekler = [(row[kategori_idx].strip(), row[tanim_idx].strip())
                for row in bolum1[1:] if len(row) > max(kategori_idx, tanim_idx)]

    # Fine-tuned modelle kategori prototiplerini hesapla (CATEGORY_EXAMPLES fallback verisi)
    kategoriler = sorted(CATEGORY_EXAMPLES.keys())
    prototipler = {}
    for kategori, ornek_cumleler in CATEGORY_EXAMPLES.items():
        vektorler = [np.array(ft_model.encode(enrich_text(e), normalize_embeddings=True)) for e in ornek_cumleler]
        proto = np.mean(vektorler, axis=0)
        prototipler[kategori] = proto / np.linalg.norm(proto)

    conf_matrix = {g: {t: 0 for t in kategoriler} for g in kategoriler}
    for kategori_ham, tanim in ornekler:
        gercek = _normalize_kategori(kategori_ham)
        if gercek not in kategoriler or not tanim:
            continue
        q = np.array(ft_model.encode(enrich_text(tanim), normalize_embeddings=True))
        q = q / np.linalg.norm(q)
        skorlar = {k: float(np.dot(q, p)) for k, p in prototipler.items()}
        tahmin = max(skorlar, key=skorlar.get)
        conf_matrix[gercek][tahmin] += 1

    matris = np.array([[conf_matrix[g][t] for t in kategoriler] for g in kategoriler])

    cmap = sns.light_palette(YESIL, as_cmap=True)
    fig, ax = plt.subplots(figsize=(10, 8))
    sns.heatmap(matris, annot=True, fmt="d", cmap=cmap, xticklabels=kategoriler,
                yticklabels=kategoriler, cbar=True, ax=ax, annot_kws={"fontsize": FS_ETIKET})
    ax.set_xlabel("Tahmin Edilen Kategori", fontsize=FS_ETIKET)
    ax.set_ylabel("Gerçek Kategori", fontsize=FS_ETIKET)
    ax.set_title("Sınıflandırma Confusion Matrix (Fine-Tuned Model)",
                 fontsize=FS_BASLIK, weight="bold", pad=20)
    plt.setp(ax.get_xticklabels(), rotation=40, ha="right")

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ═══════════════════════════════════════════════════════════════════════════
# GRAFİK 5 — Eşik / F1 eğrisi (fine-tuned model)
# ═══════════════════════════════════════════════════════════════════════════

def cizim5_esik(ft_pos: list[float], ft_neg: list[float], out_path: Path) -> None:
    """F1, precision ve recall eğrilerini eşiğe göre çizer, optimal eşiği işaretler."""
    thresholds = np.arange(0.30, 0.95 + 1e-9, 0.01)
    f1ler, precisionlar, recalller = [], [], []
    for t in thresholds:
        tp = sum(1 for s in ft_pos if s >= t)
        fn = len(ft_pos) - tp
        fp = sum(1 for s in ft_neg if s >= t)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        f1ler.append(f1)
        precisionlar.append(precision)
        recalller.append(recall)

    en_iyi = _find_optimal_threshold(ft_pos, ft_neg)

    fig, ax = plt.subplots(figsize=(12, 6))
    ax.plot(thresholds, f1ler, color=YESIL, linewidth=2.5, label="F1 Score")
    ax.plot(thresholds, precisionlar, color=MAVI, linewidth=2, linestyle="--", label="Precision")
    ax.plot(thresholds, recalller, color=KIRMIZI, linewidth=2, linestyle="--", label="Recall")
    ax.axvline(en_iyi["threshold"], color="#333333", linestyle=":", linewidth=2,
               label=f"Optimal eşik={en_iyi['threshold']:.2f} (F1={en_iyi['f1']:.3f})")

    ax.set_xlabel("Eşik değeri", fontsize=FS_ETIKET)
    ax.set_ylabel("Skor", fontsize=FS_ETIKET)
    ax.set_title("Eşik Analizi — Fine-Tuned Model", fontsize=FS_BASLIK, weight="bold", pad=20)
    ax.legend(fontsize=FS_ETIKET - 2)
    ax.grid(alpha=0.3)

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ═══════════════════════════════════════════════════════════════════════════
# GRAFİK 6 — Teknoloji stack tablosu (veri gerektirmez)
# ═══════════════════════════════════════════════════════════════════════════

def cizim6_teknoloji(out_path: Path) -> None:
    satirlar = [
        ("Embedding", "SBERT fine-tuned", "Domain-specific 768D vektör"),
        ("DB", "PostgreSQL + pgvector", "HNSW vektör araması"),
        ("API", "FastAPI", "Async, otomatik Swagger"),
        ("Hibrit", "BM25 + SBERT", "Kısaltma + anlam birleşimi"),
        ("Sınıflandırma", "Prototip tabanlı", "7 kategori, DB'den yükleme"),
        ("Konteyner", "Docker", "pgvector tek komutla"),
    ]
    col_labels = ["Bileşen", "Teknoloji", "Açıklama"]

    fig, ax = plt.subplots(figsize=(14, 8))
    ax.axis("off")
    ax.set_title("Teknoloji Stack", fontsize=FS_BASLIK, weight="bold", pad=20)

    table = ax.table(cellText=satirlar, colLabels=col_labels, loc="center", cellLoc="center")
    table.auto_set_font_size(False)
    table.set_fontsize(FS_ETIKET)
    table.scale(1, 2.6)

    # Başlık satırını renklendir
    for j in range(len(col_labels)):
        cell = table[0, j]
        cell.set_facecolor(MAVI)
        cell.set_text_props(color="white", weight="bold")

    # Satırları alternatif renklerle boyayan basit zebra deseni
    for i in range(1, len(satirlar) + 1):
        renk = "#F2F2F2" if i % 2 == 0 else "white"
        for j in range(len(col_labels)):
            table[i, j].set_facecolor(renk)

    fig.tight_layout()
    fig.savefig(out_path, dpi=DPI)
    plt.close(fig)


# ═══════════════════════════════════════════════════════════════════════════
# ANA AKIŞ
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    print("═══ DöngüNet AI — Sunum Grafikleri Üretiliyor ═══\n")

    # Veri gerektirmeyen grafikler önce
    print("Grafik 1: Mimari diyagramı çiziliyor...")
    cizim1_mimari(ROOT / "sunum_g1_mimari.png")
    print("  ✓ sunum_g1_mimari.png")

    print("Grafik 2: Pipeline akışı çiziliyor...")
    cizim2_pipeline(ROOT / "sunum_g2_pipeline.png")
    print("  ✓ sunum_g2_pipeline.png")

    print("Grafik 6: Teknoloji stack tablosu çiziliyor...")
    cizim6_teknoloji(ROOT / "sunum_g6_teknoloji.png")
    print("  ✓ sunum_g6_teknoloji.png")

    # Veri odaklı grafikler için modelleri ve veri.csv'yi yükle
    if not FINETUNED_MODEL_PATH.exists():
        print(f"═══ HATA: Fine-tuned model bulunamadı: {FINETUNED_MODEL_PATH} ═══")
        print("Grafik 3, 4, 5 üretilemedi.")
        sys.exit(1)

    print("\nModeller yükleniyor (orijinal + fine-tuned)...")
    orig_model = SentenceTransformer(ORIGINAL_MODEL_NAME)
    ft_model = SentenceTransformer(str(FINETUNED_MODEL_PATH))
    print("Modeller hazır.\n")

    sections = _load_sections(CSV_PATH)
    positives, negatives = _build_pos_neg(sections)
    positives = _enrich_pairs(positives)
    negatives = _enrich_pairs(negatives)
    print(f"Toplam pozitif çift: {len(positives)}, negatif çift: {len(negatives)}\n")

    print("Grafik 3: Öncesi/sonrası karşılaştırması hesaplanıyor (biraz sürebilir)...")
    cizim3_oncesi_sonrasi(orig_model, ft_model, positives, negatives, ROOT / "sunum_g3_oncesi_sonrasi.png")
    print("  ✓ sunum_g3_oncesi_sonrasi.png")

    print("Grafik 4: Confusion matrix hesaplanıyor...")
    cizim4_confusion_matrix(ft_model, ROOT / "sunum_g4_siniflandirma.png")
    print("  ✓ sunum_g4_siniflandirma.png")

    print("Grafik 5: Eşik analizi hesaplanıyor...")
    ft_pos = _score_pairs(ft_model, positives)
    ft_neg = _score_pairs(ft_model, negatives)
    cizim5_esik(ft_pos, ft_neg, ROOT / "sunum_g5_esik.png")
    print("  ✓ sunum_g5_esik.png")

    print("\n═══ TÜM GRAFİKLER ÜRETİLDİ ═══")


if __name__ == "__main__":
    main()

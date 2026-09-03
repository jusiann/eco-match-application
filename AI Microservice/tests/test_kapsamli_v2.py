"""DöngüNet AI mikroservisi — kapsamlı test paketi v2.

test_kapsamli.py'ın geliştirilmiş sürümü:
  - Fine-tuned SBERT modeli kullanır (embedder, config.model_name üzerinden
    ./fine_tuned_model'e işaret eder).
  - TEST 1-6 aynı kapsamla korunur (bkz. test_kapsamli.py).
  - TEST 7-9 hibrit (BM25 + SBERT) arama katmanını değerlendirir.
"""
import sys
import csv
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

sys.stdout.reconfigure(encoding="utf-8")

# tests/ içinden çalıştırıldığında proje kökünü (app paketi ve veri.csv'nin
# bulunduğu yer) sys.path'e ekle — aksi halde "app" modülü bulunamaz.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.config import settings
from app.embedder import embedder, enrich_text
from app.classifier import classifier
from app.vector_store import vector_store
from app.hybrid_search import HybridSearcher

# --- Sabitler ------------------------------------------------------------

CSV_PATH = ROOT / "veri.csv"

RENK_YESIL = "#1D9E75"
RENK_TURUNCU = "#E6A817"
RENK_KIRMIZI = "#D64545"
RENK_MAVI = "#378ADD"

ESIKLER_TEST23 = [0.50, 0.55, 0.60, 0.65, 0.70]
ESIK_ARALIGI = np.round(np.arange(0.45, 0.80 + 1e-9, 0.01), 2)
ALPHA_ARALIGI = np.round(np.arange(0.0, 1.0 + 1e-9, 0.1), 2)

KATEGORI_HARITASI = {
    "METAL": "METAL",
    "PLASTİK": "PLASTIK",
    "PLASTIK": "PLASTIK",
    "ORGANİK": "ORGANIK",
    "ORGANIK": "ORGANIK",
    "KİMYASAL": "KIMYASAL",
    "KIMYASAL": "KIMYASAL",
    "TEKSTİL": "TEKSTIL",
    "TEKSTIL": "TEKSTIL",
    "CAM": "CAM",
    "KAĞIT": "KAGIT",
    "KAGIT": "KAGIT",
}


def normalize_kategori(kategori: str) -> str:
    return KATEGORI_HARITASI.get(kategori.strip(), kategori.strip())


# --- CSV bölümleme --------------------------------------------------------

def bolumlere_ayir(csv_path: Path) -> list[list[dict]]:
    """CSV'yi oku, 'id' ile başlayan satırları yeni bölüm başlığı say."""
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        satirlar = list(csv.reader(f))

    bolumler: list[list[dict]] = []
    mevcut_baslik: list[str] | None = None
    mevcut_satirlar: list[dict] = []

    for satir in satirlar:
        if not satir or not any(alan.strip() for alan in satir):
            continue
        if satir[0].strip() == "id":
            if mevcut_baslik is not None:
                bolumler.append(mevcut_satirlar)
            mevcut_baslik = satir
            mevcut_satirlar = []
            continue
        if mevcut_baslik is None:
            continue
        satir_dict = {mevcut_baslik[i]: (satir[i] if i < len(satir) else "")
                      for i in range(len(mevcut_baslik))}
        mevcut_satirlar.append(satir_dict)

    if mevcut_baslik is not None:
        bolumler.append(mevcut_satirlar)

    return bolumler


def kosinus(a: list[float], b: list[float]) -> float:
    a = np.array(a)
    b = np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


# --- TEST 1: Sınıflandırma doğruluğu --------------------------------------

def test1_siniflandirma(bolum1: list[dict]) -> dict:
    print("\n═══ TEST 1: Sınıflandırma Doğruluğu (Bölüm 1) ═══")
    kategoriler = sorted({normalize_kategori(r["kategori"]) for r in bolum1})
    conf_matrix = {g: {t: 0 for t in kategoriler} for g in kategoriler}
    tip_sonuclari: dict[str, list[bool]] = {}
    dogru_sayisi = 0
    toplam = 0

    for row in bolum1:
        gercek = normalize_kategori(row["kategori"])
        tanim = row["tanim"]
        tip = row["tip"]
        try:
            sonuc = classifier.classify(enrich_text(tanim))
            tahmin = sonuc["category"]
        except Exception as exc:
            print(f"  ! Sınıflandırma hatası ({row.get('id')}): {exc}")
            continue

        toplam += 1
        dogru = (tahmin == gercek)
        if dogru:
            dogru_sayisi += 1
        conf_matrix.setdefault(gercek, {k: 0 for k in kategoriler})
        conf_matrix[gercek][tahmin] = conf_matrix[gercek].get(tahmin, 0) + 1
        tip_sonuclari.setdefault(tip, []).append(dogru)

    toplam_dogruluk = dogru_sayisi / toplam * 100 if toplam else 0.0
    print(f"  Toplam doğruluk: {dogru_sayisi}/{toplam} = %{toplam_dogruluk:.1f}")
    print("  Tip bazında doğruluk:")
    tip_dogruluk = {}
    for tip, sonuclar in sorted(tip_sonuclari.items()):
        oran = sum(sonuclar) / len(sonuclar) * 100
        tip_dogruluk[tip] = oran
        print(f"    {tip:15s}: {sum(sonuclar):3d}/{len(sonuclar):3d} = %{oran:.1f}")

    print(f"  Sonuç: {'✓' if toplam_dogruluk >= 70 else '✗'}")

    return {
        "toplam_dogruluk": toplam_dogruluk,
        "tip_dogruluk": tip_dogruluk,
        "confusion_matrix": conf_matrix,
        "kategoriler": kategoriler,
    }


# --- Ortak: çift skorlama yardımcı fonksiyonu -----------------------------

def ciftleri_skorla(ciftler: list[tuple[str, str]]) -> list[float]:
    skorlar = []
    for cikti, girdi in ciftler:
        try:
            v1 = embedder.encode(enrich_text(cikti))
            v2 = embedder.encode(enrich_text(girdi))
            skorlar.append(kosinus(v1, v2))
        except Exception as exc:
            print(f"  ! Skorlama hatası: {exc}")
    return skorlar


# --- TEST 2: Pozitif eşleştirme -------------------------------------------

def test2_pozitif(bolum3: list[dict], bolum5: list[dict]) -> dict:
    print("\n═══ TEST 2: Pozitif Eşleştirme (Bölüm 3 + Bölüm 5, etiket=1) ═══")
    ciftler = []
    for row in bolum3:
        if row.get("etiket", "").strip() == "1":
            ciftler.append((row["cikti_tanim"], row["girdi_tanim"]))
    for row in bolum5:
        if row.get("etiket", "").strip() == "1":
            ciftler.append((row["cikti_tanim"], row["girdi_tanim"]))

    skorlar = ciftleri_skorla(ciftler)
    arr = np.array(skorlar)
    print(f"  N={len(arr)}  ort={arr.mean():.4f}  min={arr.min():.4f}  "
          f"max={arr.max():.4f}  std={arr.std():.4f}")
    for esik in ESIKLER_TEST23:
        n_eslesen = int((arr >= esik).sum())
        print(f"  Eşik {esik:.2f}: {n_eslesen}/{len(arr)} eşleşti "
              f"(%{n_eslesen/len(arr)*100:.1f})")

    print(f"  Sonuç: {'✓' if arr.mean() >= 0.55 else '✗'}")
    return {"skorlar": skorlar, "ortalama": float(arr.mean()), "std": float(arr.std())}


# --- TEST 3: Negatif eşleştirme -------------------------------------------

def test3_negatif(bolum2: list[dict], bolum6: list[dict], bolum7: list[dict]) -> dict:
    print("\n═══ TEST 3: Negatif Eşleştirme (Bölüm 2 + Bölüm 6[0] + Bölüm 7) ═══")

    ayni_kategori_ciftler = []
    for row in bolum2:
        ayni_kategori_ciftler.append((row["cikti_tanim"], row["girdi_tanim"]))
    for row in bolum7:
        ayni_kategori_ciftler.append((row["cikti_tanim"], row["girdi_tanim"]))

    capraz_kategori_ciftler = []
    for row in bolum6:
        if row.get("etiket", "").strip() == "0":
            capraz_kategori_ciftler.append((row["cikti_tanim"], row["girdi_tanim"]))

    ayni_skorlar = ciftleri_skorla(ayni_kategori_ciftler)
    capraz_skorlar = ciftleri_skorla(capraz_kategori_ciftler)
    tum_skorlar = ayni_skorlar + capraz_skorlar
    arr = np.array(tum_skorlar)

    print(f"  Aynı kategori içi N={len(ayni_skorlar)}  ort={np.mean(ayni_skorlar):.4f}")
    print(f"  Çapraz kategori N={len(capraz_skorlar)}  ort={np.mean(capraz_skorlar):.4f}")
    print(f"  Genel N={len(arr)}  ort={arr.mean():.4f}  min={arr.min():.4f}  "
          f"max={arr.max():.4f}  std={arr.std():.4f}")

    for esik in ESIKLER_TEST23:
        n_fp = int((arr >= esik).sum())
        print(f"  Eşik {esik:.2f}: {n_fp}/{len(arr)} yanlış eşleşti (FP) "
              f"(%{n_fp/len(arr)*100:.1f})")

    print(f"  Sonuç: {'✓' if arr.mean() < 0.55 else '✗'}")
    return {
        "skorlar": tum_skorlar,
        "ayni_kategori_skorlar": ayni_skorlar,
        "capraz_kategori_skorlar": capraz_skorlar,
        "ortalama": float(arr.mean()),
    }


# --- TEST 4: Sınırda çiftler -----------------------------------------------

def test4_sinirda(bolum6: list[dict]) -> dict:
    print("\n═══ TEST 4: Sınırda Çiftler (Bölüm 6, etiket=0.5) ═══")
    ciftler = []
    for row in bolum6:
        if row.get("etiket", "").strip() == "0.5":
            ciftler.append((row["cikti_tanim"], row["girdi_tanim"]))

    skorlar = ciftleri_skorla(ciftler)
    arr = np.array(skorlar)
    print(f"  N={len(arr)}  ort={arr.mean():.4f}  min={arr.min():.4f}  "
          f"max={arr.max():.4f}  std={arr.std():.4f}")
    print(f"  Medyan={np.median(arr):.4f}  Çeyrekler=[{np.percentile(arr,25):.4f}, "
          f"{np.percentile(arr,75):.4f}]")
    print("  Sonuç: ✓ (bilgilendirici test — dağılım raporlandı)")
    return {"skorlar": skorlar, "ortalama": float(arr.mean())}


# --- TEST 5: Edge cases -----------------------------------------------------

def test5_edge_cases(bolum4: list[dict]) -> dict:
    print("\n═══ TEST 5: Edge Cases (Bölüm 4) ═══")
    tip_sonuclari: dict[str, list[tuple[bool, float]]] = {}

    def beklenen_kontrol(skor: float, beklenen: str) -> bool:
        if beklenen == "yuksek":
            return skor > 0.70
        if beklenen == "orta":
            return 0.45 < skor < 0.75
        if beklenen == "dusuk":
            return skor < 0.50
        return False

    for row in bolum4:
        tip = row["tip"]
        beklenen = row["beklenen_benzerlik"].strip()
        try:
            v1 = embedder.encode(enrich_text(row["metin_1"]))
            v2 = embedder.encode(enrich_text(row["metin_2"]))
            skor = kosinus(v1, v2)
        except Exception as exc:
            print(f"  ! Hata ({row.get('id')}): {exc}")
            continue
        dogru = beklenen_kontrol(skor, beklenen)
        tip_sonuclari.setdefault(tip, []).append((dogru, skor))

    tip_dogruluk = {}
    for tip, sonuclar in sorted(tip_sonuclari.items()):
        dogrular = [d for d, _ in sonuclar]
        oran = sum(dogrular) / len(dogrular) * 100
        tip_dogruluk[tip] = oran
        print(f"    {tip:18s}: {sum(dogrular):2d}/{len(dogrular):2d} = %{oran:.1f}")

    genel_dogruluk = np.mean([d for sonuclar in tip_sonuclari.values() for d, _ in sonuclar]) * 100
    print(f"  Genel edge-case doğruluğu: %{genel_dogruluk:.1f}")
    print(f"  Sonuç: {'✓' if genel_dogruluk >= 60 else '✗'}")

    return {"tip_dogruluk": tip_dogruluk, "tip_sonuclari": tip_sonuclari,
            "genel_dogruluk": genel_dogruluk}


# --- TEST 6: Optimal eşik bulma --------------------------------------------

def esik_tarama(pozitif_skorlar, negatif_skorlar, esik_araligi=ESIK_ARALIGI) -> list[dict]:
    """Eşik aralığında precision/recall/F1 hesapla — TEST 6 ve TEST 9'da ortak kullanılır."""
    pos = np.array(pozitif_skorlar)
    neg = np.array(negatif_skorlar)
    sonuclar = []
    for esik in esik_araligi:
        tp = int((pos >= esik).sum())
        fn = int((pos < esik).sum())
        fp = int((neg >= esik).sum())
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)
              if (precision + recall) > 0 else 0.0)
        sonuclar.append({"esik": esik, "precision": precision, "recall": recall, "f1": f1})
    return sonuclar


def test6_optimal_esik(pozitif_skorlar: list[float], negatif_skorlar: list[float]) -> dict:
    print("\n═══ TEST 6: Optimal Eşik Bulma ═══")
    sonuclar = esik_tarama(pozitif_skorlar, negatif_skorlar)
    en_iyi = max(sonuclar, key=lambda r: r["f1"])
    print(f"  Optimal eşik: {en_iyi['esik']:.2f}  "
          f"(Precision={en_iyi['precision']:.3f}, Recall={en_iyi['recall']:.3f}, "
          f"F1={en_iyi['f1']:.3f})")
    print("  Sonuç: ✓")
    return {"sonuclar": sonuclar, "optimal": en_iyi}


# --- Genişletilmiş pozitif/negatif çift çıkarımı (TEST 7-9 için) ----------

def genisletilmis_ciftler(bolumler_dict: dict[str, list[dict]]) -> dict:
    """Tüm bölümlerden (2,3,5,6,7,8,9,10) etiketli çiftleri bölüm bilgisiyle çıkar.

    fine_tune.py / evaluate_finetuned.py ile aynı kapsam: Bölüm 3+5+8+9(1)
    pozitif; Bölüm 2+6(0)+7+9(0)+10 negatif.
    """
    def ciftler(rows, etiket_filtre=None):
        sonuc = []
        for row in rows:
            etiket = row.get("etiket", "").strip()
            if etiket_filtre is not None and etiket != etiket_filtre:
                continue
            cikti = row.get("cikti_tanim", "").strip()
            girdi = row.get("girdi_tanim", "").strip()
            if not cikti or not girdi:
                continue
            sonuc.append((cikti, girdi))
        return sonuc

    b2 = bolumler_dict.get("Bölüm2", [])
    b3 = bolumler_dict.get("Bölüm3", [])
    b5 = bolumler_dict.get("Bölüm5", [])
    b6 = bolumler_dict.get("Bölüm6", [])
    b7 = bolumler_dict.get("Bölüm7", [])
    b8 = bolumler_dict.get("Bölüm8", [])
    b9 = bolumler_dict.get("Bölüm9", [])
    b10 = bolumler_dict.get("Bölüm10", [])

    per_bolum = {
        "Bölüm2": ciftler(b2, "0"),
        "Bölüm3": ciftler(b3, "1"),
        "Bölüm5": ciftler(b5, "1"),
        "Bölüm6_neg": ciftler(b6, "0"),
        "Bölüm6_sinirda": ciftler(b6, "0.5"),
        "Bölüm7": ciftler(b7, "0"),
        "Bölüm8": ciftler(b8, "1"),
        "Bölüm9_pos": ciftler(b9, "1"),
        "Bölüm9_neg": ciftler(b9, "0"),
        "Bölüm10": ciftler(b10, "0"),
    }

    positives = per_bolum["Bölüm3"] + per_bolum["Bölüm5"] + per_bolum["Bölüm8"] + per_bolum["Bölüm9_pos"]
    negatives = (per_bolum["Bölüm2"] + per_bolum["Bölüm6_neg"] + per_bolum["Bölüm7"]
                 + per_bolum["Bölüm9_neg"] + per_bolum["Bölüm10"])

    return {"positives": positives, "negatives": negatives, "per_bolum": per_bolum}


# --- TEST 7: BM25 etki analizi (kısaltmalar) --------------------------------

def test7_bm25_etki(bolum1: list[dict], hybrid_searcher: HybridSearcher) -> dict:
    print("\n═══ TEST 7: BM25 Etki Analizi (Bölüm 1, tip=kisaltma) ═══")

    kisaltma_rows = [r for r in bolum1 if r.get("tip", "").strip() == "kisaltma"]
    if not kisaltma_rows:
        print("  ! 'kisaltma' tipinde örnek bulunamadı.")
        return {}

    # BM25 + SBERT için ortak korpus: bölüm 1'in tamamı
    corpus_docs = []
    corpus_kategori: dict[str, str] = {}
    corpus_vektor: dict[str, np.ndarray] = {}
    for row in bolum1:
        rid = row["id"]
        metin = enrich_text(row["tanim"])
        corpus_docs.append({"record_id": rid, "text": metin})
        corpus_kategori[rid] = normalize_kategori(row["kategori"])
        corpus_vektor[rid] = np.array(embedder.encode(metin))

    hybrid_searcher.build_index(corpus_docs)

    sonuclar = []
    for row in kisaltma_rows:
        qid = row["id"]
        qkategori = normalize_kategori(row["kategori"])
        qtext = enrich_text(row["tanim"])
        qvec = np.array(embedder.encode(qtext))

        # --- Sadece SBERT: en yüksek kosinüs benzerliğine sahip döküman (kendisi hariç)
        sbert_results = []
        for doc in corpus_docs:
            rid = doc["record_id"]
            if rid == qid:
                continue
            sim = kosinus(qvec, corpus_vektor[rid])
            sbert_results.append({"record_id": rid, "similarity": sim})
        sbert_results.sort(key=lambda x: x["similarity"], reverse=True)
        sbert_top = sbert_results[0]

        # --- Sadece BM25: en yüksek normalize skora sahip döküman (kendisi hariç)
        tokenized_query = qtext.lower().split()
        bm25_scores_raw = hybrid_searcher._bm25.get_scores(tokenized_query)
        bmin, bmax = min(bm25_scores_raw), max(bm25_scores_raw)
        bm25_norm_list = [
            (hybrid_searcher._record_ids[i],
             (s - bmin) / (bmax - bmin) if bmax > bmin else 0.0)
            for i, s in enumerate(bm25_scores_raw)
        ]
        bm25_norm_list = [x for x in bm25_norm_list if x[0] != qid]
        bm25_norm_list.sort(key=lambda x: x[1], reverse=True)
        bm25_top_id, bm25_top_score = bm25_norm_list[0]

        # --- Hibrit: RRF/ağırlıklı birleşim (kendisi hariç)
        hybrid_results = hybrid_searcher.search(qtext, sbert_results, top_k=len(corpus_docs))
        hybrid_results = [r for r in hybrid_results if r["record_id"] != qid]
        hybrid_top = hybrid_results[0]

        sbert_dogru = corpus_kategori[sbert_top["record_id"]] == qkategori
        bm25_dogru = corpus_kategori[bm25_top_id] == qkategori
        hybrid_dogru = corpus_kategori[hybrid_top["record_id"]] == qkategori

        sonuclar.append({
            "id": qid,
            "kategori": qkategori,
            "sbert_skor": sbert_top["similarity"],
            "sbert_dogru": sbert_dogru,
            "bm25_skor": bm25_top_score,
            "bm25_dogru": bm25_dogru,
            "hibrit_skor": hybrid_top["hybrid_score"],
            "hibrit_dogru": hybrid_dogru,
        })

    sbert_dogruluk = sum(1 for s in sonuclar if s["sbert_dogru"]) / len(sonuclar) * 100
    bm25_dogruluk = sum(1 for s in sonuclar if s["bm25_dogru"]) / len(sonuclar) * 100
    hibrit_dogruluk = sum(1 for s in sonuclar if s["hibrit_dogru"]) / len(sonuclar) * 100

    sbert_ort = np.mean([s["sbert_skor"] for s in sonuclar])
    bm25_ort = np.mean([s["bm25_skor"] for s in sonuclar])
    hibrit_ort = np.mean([s["hibrit_skor"] for s in sonuclar])

    print(f"  N={len(sonuclar)} kısaltma örneği")
    print(f"  {'Yöntem':<12}{'Ort. Skor':<12}{'Doğru Kategori Top-1':<22}")
    print(f"  {'SBERT':<12}{sbert_ort:<12.3f}%{sbert_dogruluk:.1f}")
    print(f"  {'BM25':<12}{bm25_ort:<12.3f}%{bm25_dogruluk:.1f}")
    print(f"  {'Hibrit':<12}{hibrit_ort:<12.3f}%{hibrit_dogruluk:.1f}")

    if bm25_dogruluk > sbert_dogruluk:
        print("  Sonuç: ✓ BM25, kısaltma içeren örneklerde SBERT'e göre daha iyi kategori eşleşmesi sağlıyor.")
    else:
        print("  Sonuç: ℹ BM25, bu veri setinde belirgin bir iyileştirme sağlamadı (enrich_text zaten kısaltmaları açıyor).")

    return {
        "sonuclar": sonuclar,
        "sbert_dogruluk": sbert_dogruluk,
        "bm25_dogruluk": bm25_dogruluk,
        "hibrit_dogruluk": hibrit_dogruluk,
        "sbert_ort": float(sbert_ort),
        "bm25_ort": float(bm25_ort),
        "hibrit_ort": float(hibrit_ort),
    }


# --- TEST 8: Bölüm bazlı analiz --------------------------------------------

def test8_bolum_bazli(per_bolum: dict[str, list[tuple[str, str]]]) -> dict:
    print("\n═══ TEST 8: Bölüm Bazlı Analiz ═══")

    sirali_anahtarlar = [
        "Bölüm2", "Bölüm3", "Bölüm5", "Bölüm6_neg", "Bölüm6_sinirda",
        "Bölüm7", "Bölüm8", "Bölüm9_pos", "Bölüm9_neg", "Bölüm10",
    ]
    goruntu_adlari = {
        "Bölüm2": "Bölüm 2 (negatif)",
        "Bölüm3": "Bölüm 3 (pozitif)",
        "Bölüm5": "Bölüm 5 (pozitif)",
        "Bölüm6_neg": "Bölüm 6 (negatif)",
        "Bölüm6_sinirda": "Bölüm 6 (sınırda)",
        "Bölüm7": "Bölüm 7 (negatif)",
        "Bölüm8": "Bölüm 8 (pozitif, kısa)",
        "Bölüm9_pos": "Bölüm 9 (pozitif)",
        "Bölüm9_neg": "Bölüm 9 (negatif)",
        "Bölüm10": "Bölüm 10 (hard negative)",
    }

    sonuc = {}
    for anahtar in sirali_anahtarlar:
        ciftler = per_bolum.get(anahtar, [])
        if not ciftler:
            continue
        skorlar = ciftleri_skorla(ciftler)
        if not skorlar:
            continue
        ort = float(np.mean(skorlar))
        sonuc[anahtar] = {"ortalama": ort, "n": len(skorlar), "skorlar": skorlar}
        not_str = ""
        if anahtar == "Bölüm8":
            not_str = "  <- kısa format, iyileşme kritik"
        elif anahtar == "Bölüm10":
            not_str = "  <- hard negative, ayrım kritik (düşük olmalı)"
        print(f"  {goruntu_adlari[anahtar]:<28} N={len(skorlar):3d}  ort={ort:.4f}{not_str}")

    print("  Sonuç: ✓ (bilgilendirici test — bölüm bazlı dağılım raporlandı)")
    return {"per_bolum_skor": sonuc, "goruntu_adlari": goruntu_adlari, "sira": sirali_anahtarlar}


# --- TEST 9: Optimal alpha bulma -------------------------------------------

def test9_optimal_alpha(positives: list[tuple[str, str]], negatives: list[tuple[str, str]]) -> dict:
    print("\n═══ TEST 9: Optimal Alpha Bulma (BM25 ağırlığı) ═══")

    tum_ciftler = [(c, g, 1.0) for c, g in positives] + [(c, g, 0.0) for c, g in negatives]

    # Global BM25 korpusu: tüm çift metinleri (dedup)
    metin_indeksi: dict[str, int] = {}
    corpus_texts: list[str] = []
    for cikti, girdi, _ in tum_ciftler:
        for metin in (cikti, girdi):
            zengin = enrich_text(metin)
            if zengin not in metin_indeksi:
                metin_indeksi[zengin] = len(corpus_texts)
                corpus_texts.append(zengin)

    tokenized_corpus = [t.lower().split() for t in corpus_texts]
    from rank_bm25 import BM25Okapi
    bm25 = BM25Okapi(tokenized_corpus)

    # Her çift için SBERT ve satır-bazlı normalize BM25 skorunu bir kez hesapla
    sbert_skorlari = []
    bm25_skorlari = []
    etiketler = []
    for cikti, girdi, etiket in tum_ciftler:
        cikti_z = enrich_text(cikti)
        girdi_z = enrich_text(girdi)

        v1 = embedder.encode(cikti_z)
        v2 = embedder.encode(girdi_z)
        sbert_skor = kosinus(v1, v2)

        query_tok = cikti_z.lower().split()
        satir_skorlari = bm25.get_scores(query_tok)
        smin, smax = min(satir_skorlari), max(satir_skorlari)
        hedef_idx = metin_indeksi[girdi_z]
        ham = satir_skorlari[hedef_idx]
        bm25_skor = (ham - smin) / (smax - smin) if smax > smin else 0.0

        sbert_skorlari.append(sbert_skor)
        bm25_skorlari.append(bm25_skor)
        etiketler.append(etiket)

    sbert_arr = np.array(sbert_skorlari)
    bm25_arr = np.array(bm25_skorlari)
    etiket_arr = np.array(etiketler)

    alpha_sonuclari = []
    for alpha in ALPHA_ARALIGI:
        hibrit_arr = alpha * bm25_arr + (1 - alpha) * sbert_arr
        pos_skorlar = hibrit_arr[etiket_arr == 1.0].tolist()
        neg_skorlar = hibrit_arr[etiket_arr == 0.0].tolist()
        tarama = esik_tarama(pos_skorlar, neg_skorlar)
        en_iyi = max(tarama, key=lambda r: r["f1"])
        alpha_sonuclari.append({"alpha": float(alpha), **en_iyi})
        print(f"  alpha={alpha:.1f}  optimal_esik={en_iyi['esik']:.2f}  "
              f"F1={en_iyi['f1']:.3f}  P={en_iyi['precision']:.3f}  R={en_iyi['recall']:.3f}")

    en_iyi_alpha = max(alpha_sonuclari, key=lambda r: r["f1"])
    print(f"\n  En iyi alpha: {en_iyi_alpha['alpha']:.1f} "
          f"(eşik={en_iyi_alpha['esik']:.2f}, F1={en_iyi_alpha['f1']:.3f})")
    print(f"  (Mevcut config.bm25_alpha=0.4 karşılaştırması için yukarıdaki tabloya bakınız)")
    print("  Sonuç: ✓")

    return {"alpha_sonuclari": alpha_sonuclari, "en_iyi": en_iyi_alpha}


# --- Grafikler (TEST 1-6, aynı) --------------------------------------------

def grafik1_confusion_matrix(sonuc1: dict) -> None:
    kategoriler = sonuc1["kategoriler"]
    cm = sonuc1["confusion_matrix"]
    matris = np.array([[cm.get(g, {}).get(t, 0) for t in kategoriler] for g in kategoriler])

    fig, ax = plt.subplots(figsize=(9, 7))
    cmap = sns.light_palette(RENK_YESIL, as_cmap=True)
    sns.heatmap(matris, annot=True, fmt="d", cmap=cmap, xticklabels=kategoriler,
                yticklabels=kategoriler, ax=ax, cbar=True, linewidths=0.5,
                linecolor="white")
    for i in range(len(kategoriler)):
        for j in range(len(kategoriler)):
            if i != j and matris[i, j] > 0:
                ax.add_patch(plt.Rectangle((j, i), 1, 1, fill=True,
                                            facecolor=RENK_KIRMIZI, alpha=0.35, edgecolor="none"))
                ax.text(j + 0.5, i + 0.5, str(matris[i, j]), ha="center", va="center",
                        color="black", fontweight="bold")
    ax.set_xlabel("Tahmin Edilen Kategori")
    ax.set_ylabel("Gerçek Kategori")
    ax.set_title("DöngüNet Sınıflandırma — Confusion Matrix (N=140)")
    plt.tight_layout()
    plt.savefig(ROOT / "test_g1_siniflandirma.png", dpi=150)
    plt.close(fig)


def grafik2_tip_dogruluk(sonuc1: dict) -> None:
    tipler = list(sonuc1["tip_dogruluk"].keys())
    degerler = list(sonuc1["tip_dogruluk"].values())

    fig, ax = plt.subplots(figsize=(8, 5))
    renkler = [RENK_YESIL if v >= 70 else (RENK_TURUNCU if v >= 50 else RENK_KIRMIZI)
               for v in degerler]
    ax.bar(tipler, degerler, color=renkler)
    ax.set_ylim(0, 105)
    ax.set_ylabel("Doğruluk (%)")
    ax.set_title("Girdi Tipine Göre Sınıflandırma Doğruluğu")
    for i, v in enumerate(degerler):
        ax.text(i, v + 1.5, f"%{v:.1f}", ha="center")
    plt.tight_layout()
    plt.savefig(ROOT / "test_g2_siniflandirma_tip.png", dpi=150)
    plt.close(fig)


def grafik3_skor_dagilimi(pozitif: list[float], negatif: list[float],
                           sinirda: list[float], optimal_esik: float) -> None:
    fig, ax = plt.subplots(figsize=(10, 6))
    bins = np.linspace(0, 1, 40)
    ax.hist(pozitif, bins=bins, alpha=0.6, color=RENK_YESIL, label=f"Pozitif (n={len(pozitif)})")
    ax.hist(negatif, bins=bins, alpha=0.6, color=RENK_KIRMIZI, label=f"Negatif (n={len(negatif)})")
    ax.hist(sinirda, bins=bins, alpha=0.6, color=RENK_TURUNCU, label=f"Sınırda (n={len(sinirda)})")
    ax.axvline(optimal_esik, color="black", linestyle="--", linewidth=2,
               label=f"Optimal eşik = {optimal_esik:.2f}")
    ax.set_xlabel("Kosinüs Benzerlik Skoru")
    ax.set_ylabel("Frekans")
    ax.set_title("Eşleştirme Skoru Dağılımı")
    ax.legend()
    plt.tight_layout()
    plt.savefig(ROOT / "test_g3_skor_dagilimi.png", dpi=150)
    plt.close(fig)


def grafik4_esik_analizi(sonuc6: dict) -> None:
    sonuclar = sonuc6["sonuclar"]
    esikler = [r["esik"] for r in sonuclar]
    precision = [r["precision"] for r in sonuclar]
    recall = [r["recall"] for r in sonuclar]
    f1 = [r["f1"] for r in sonuclar]
    optimal_esik = sonuc6["optimal"]["esik"]

    fig, ax1 = plt.subplots(figsize=(10, 6))
    ax1.plot(esikler, precision, color=RENK_MAVI, label="Precision")
    ax1.plot(esikler, recall, color=RENK_KIRMIZI, label="Recall")
    ax1.set_xlabel("Eşik")
    ax1.set_ylabel("Precision / Recall")
    ax1.set_ylim(0, 1.05)

    ax2 = ax1.twinx()
    ax2.plot(esikler, f1, color=RENK_YESIL, linewidth=3, label="F1")
    ax2.set_ylabel("F1 Skoru")
    ax2.set_ylim(0, 1.05)

    ax1.axvline(optimal_esik, color="black", linestyle="--", linewidth=1.5)

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="lower center")

    ax1.set_title(f"Eşik Kalibrasyonu — Precision / Recall / F1 (Optimal={optimal_esik:.2f})")
    plt.tight_layout()
    plt.savefig(ROOT / "test_g4_esik_analizi.png", dpi=150)
    plt.close(fig)


def grafik5_edge_cases(sonuc5: dict) -> None:
    tip_sonuclari = sonuc5["tip_sonuclari"]
    tipler = list(tip_sonuclari.keys())
    n = len(tipler)
    fig, eksenler = plt.subplots(1, n, figsize=(4 * n, 5), squeeze=False)
    eksenler = eksenler[0]

    for ax, tip in zip(eksenler, tipler):
        sonuclar = tip_sonuclari[tip]
        skorlar = [s for _, s in sonuclar]
        renkler = [RENK_YESIL if d else RENK_KIRMIZI for d, _ in sonuclar]
        x = range(len(skorlar))
        ax.bar(x, skorlar, color=renkler)
        ax.axhline(0.70, color="gray", linestyle=":", linewidth=1)
        ax.axhline(0.50, color="gray", linestyle=":", linewidth=1)
        ax.set_title(tip)
        ax.set_ylim(0, 1.0)
        ax.set_xticks([])

    fig.suptitle("Edge Case Analizi")
    plt.tight_layout()
    plt.savefig(ROOT / "test_g5_edge_cases.png", dpi=150)
    plt.close(fig)


def grafik6_ozet_tablo(sonuc1: dict, sonuc2: dict, sonuc3: dict, sonuc6: dict,
                        sonuc5: dict) -> None:
    optimal = sonuc6["optimal"]
    satirlar = [
        ["Sınıflandırma doğruluğu (toplam)", f"%{sonuc1['toplam_dogruluk']:.1f}"],
    ]
    for tip, oran in sonuc1["tip_dogruluk"].items():
        satirlar.append([f"  - {tip}", f"%{oran:.1f}"])
    satirlar.append(["Pozitif eşleştirme ort. skor", f"{sonuc2['ortalama']:.4f}"])
    satirlar.append(["Negatif eşleştirme ort. skor", f"{sonuc3['ortalama']:.4f}"])
    fp_orani = sum(1 for s in sonuc3["skorlar"] if s >= optimal["esik"]) / len(sonuc3["skorlar"]) * 100
    satirlar.append([f"False positive oranı (eşik={optimal['esik']:.2f})", f"%{fp_orani:.1f}"])
    satirlar.append(["Optimal eşik", f"{optimal['esik']:.2f}"])
    satirlar.append(["Optimal eşikte F1", f"{optimal['f1']:.3f}"])
    for tip, oran in sonuc5["tip_dogruluk"].items():
        satirlar.append([f"Edge case - {tip}", f"%{oran:.1f}"])

    fig, ax = plt.subplots(figsize=(9, 0.5 * len(satirlar) + 1.5))
    ax.axis("off")
    tablo = ax.table(cellText=satirlar, colLabels=["Metrik", "Değer"],
                      loc="center", cellLoc="left", colWidths=[0.7, 0.3])
    tablo.auto_set_font_size(False)
    tablo.set_fontsize(10)
    tablo.scale(1, 1.5)
    for (row, col), cell in tablo.get_celld().items():
        if row == 0:
            cell.set_facecolor(RENK_MAVI)
            cell.set_text_props(color="white", fontweight="bold")
        else:
            cell.set_facecolor("#F5F5F5" if row % 2 == 0 else "white")

    ax.set_title("DöngüNet SBERT (Fine-Tuned) — Performans Özet Tablosu", fontsize=13, pad=20)
    plt.tight_layout()
    plt.savefig(ROOT / "test_g6_ozet_tablo.png", dpi=150)
    plt.close(fig)


# --- Grafikler (TEST 7-9, yeni) --------------------------------------------

def grafik7_hybrid(sonuc7: dict) -> None:
    sonuclar = sonuc7["sonuclar"]
    ids = [s["id"] for s in sonuclar]
    sbert = [s["sbert_skor"] for s in sonuclar]
    bm25 = [s["bm25_skor"] for s in sonuclar]
    hibrit = [s["hibrit_skor"] for s in sonuclar]

    x = np.arange(len(ids))
    genislik = 0.26

    fig, ax = plt.subplots(figsize=(max(12, len(ids) * 0.5), 6))
    ax.bar(x - genislik, sbert, width=genislik, color=RENK_MAVI, label="Sadece SBERT")
    ax.bar(x, bm25, width=genislik, color=RENK_TURUNCU, label="Sadece BM25")
    ax.bar(x + genislik, hibrit, width=genislik, color=RENK_YESIL, label="Hibrit")

    ax.set_xticks(x)
    ax.set_xticklabels(ids, rotation=90, fontsize=7)
    ax.set_ylabel("En iyi eşleşme skoru (normalize)")
    ax.set_title("Kısaltma Örneklerinde SBERT vs BM25 vs Hibrit — En İyi Eşleşme Skoru")
    ax.legend()
    plt.tight_layout()
    plt.savefig(ROOT / "test_g7_hybrid.png", dpi=150)
    plt.close(fig)


def grafik8_bolum_bazli(sonuc8: dict) -> None:
    sira = [k for k in sonuc8["sira"] if k in sonuc8["per_bolum_skor"]]
    isimler = [sonuc8["goruntu_adlari"][k] for k in sira]
    degerler = [[sonuc8["per_bolum_skor"][k]["ortalama"]] for k in sira]

    fig, ax = plt.subplots(figsize=(6, max(4, 0.5 * len(sira))))
    cmap = sns.diverging_palette(10, 150, as_cmap=True)  # kırmızı(düşük) - yeşil(yüksek)
    sns.heatmap(degerler, annot=True, fmt=".3f", cmap=cmap, center=0.5,
                yticklabels=isimler, xticklabels=["Ortalama Skor"],
                ax=ax, cbar=True, linewidths=0.5, linecolor="white")
    ax.set_title("Bölüm Bazlı Ortalama Benzerlik Skoru")
    plt.tight_layout()
    plt.savefig(ROOT / "test_g8_bolum_bazli.png", dpi=150)
    plt.close(fig)


def grafik9_alpha(sonuc9: dict) -> None:
    sonuclar = sonuc9["alpha_sonuclari"]
    alphalar = [r["alpha"] for r in sonuclar]
    f1ler = [r["f1"] for r in sonuclar]
    en_iyi = sonuc9["en_iyi"]

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.plot(alphalar, f1ler, color=RENK_YESIL, linewidth=2.5, marker="o")
    ax.axvline(en_iyi["alpha"], color="black", linestyle="--", linewidth=1.5,
               label=f"En iyi alpha={en_iyi['alpha']:.1f} (F1={en_iyi['f1']:.3f})")
    ax.axvline(0.4, color=RENK_MAVI, linestyle=":", linewidth=1.5,
               label="Mevcut config (alpha=0.4)")
    ax.set_xlabel("Alpha (BM25 ağırlığı)")
    ax.set_ylabel("Optimal eşikte F1 Skoru")
    ax.set_title("Alpha vs F1 — Optimal Hibrit Ağırlık Analizi")
    ax.set_ylim(0, 1.05)
    ax.legend()
    ax.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig(ROOT / "test_g9_alpha.png", dpi=150)
    plt.close(fig)


# --- Ana akış ---------------------------------------------------------------

def main() -> None:
    print("DöngüNet AI — Kapsamlı Test Paketi v2 (Fine-Tuned + Hibrit) başlatılıyor...")
    print(f"Model: {settings.model_name}")
    print("Model yükleniyor...")
    embedder.load()
    vector_store.connect()
    classifier.load_model()  # sınıflandırma artık kendi (orijinal/multilingual) modelini kullanıyor
    classifier.load_examples_from_db(vector_store.get_connection())
    classifier.build_prototypes()
    toplam_ornek = sum(len(v) for v in classifier.examples.values())
    print(f"Prototipler {len(classifier.examples)} kategori, {toplam_ornek} örnekle hesaplandı")
    print("Model ve prototipler hazır.\n")

    bolumler = bolumlere_ayir(CSV_PATH)
    print(f"CSV {len(bolumler)} bölüme ayrıldı: " +
          ", ".join(f"B{i+1}={len(b)}" for i, b in enumerate(bolumler)))

    bolum1, bolum2, bolum3, bolum4, bolum5, bolum6, bolum7, bolum8, bolum9, bolum10 = (
        bolumler + [[]] * (10 - len(bolumler))
    )[:10]

    bolumler_dict = {
        "Bölüm2": bolum2, "Bölüm3": bolum3, "Bölüm5": bolum5, "Bölüm6": bolum6,
        "Bölüm7": bolum7, "Bölüm8": bolum8, "Bölüm9": bolum9, "Bölüm10": bolum10,
    }

    sonuc1 = sonuc2 = sonuc3 = sonuc4 = sonuc5 = sonuc6 = None
    sonuc7 = sonuc8 = sonuc9 = None

    try:
        sonuc1 = test1_siniflandirma(bolum1)
    except Exception as exc:
        print(f"  TEST 1 BAŞARISIZ: {exc}")

    try:
        sonuc2 = test2_pozitif(bolum3, bolum5)
    except Exception as exc:
        print(f"  TEST 2 BAŞARISIZ: {exc}")

    try:
        sonuc3 = test3_negatif(bolum2, bolum6, bolum7)
    except Exception as exc:
        print(f"  TEST 3 BAŞARISIZ: {exc}")

    try:
        sonuc4 = test4_sinirda(bolum6)
    except Exception as exc:
        print(f"  TEST 4 BAŞARISIZ: {exc}")

    try:
        sonuc5 = test5_edge_cases(bolum4)
    except Exception as exc:
        print(f"  TEST 5 BAŞARISIZ: {exc}")

    try:
        if sonuc2 and sonuc3:
            sonuc6 = test6_optimal_esik(sonuc2["skorlar"], sonuc3["skorlar"])
    except Exception as exc:
        print(f"  TEST 6 BAŞARISIZ: {exc}")

    hybrid_searcher = HybridSearcher(alpha=0.4)

    try:
        sonuc7 = test7_bm25_etki(bolum1, hybrid_searcher)
    except Exception as exc:
        print(f"  TEST 7 BAŞARISIZ: {exc}")

    genis = None
    try:
        genis = genisletilmis_ciftler(bolumler_dict)
    except Exception as exc:
        print(f"  ! Genişletilmiş çift çıkarımı başarısız: {exc}")

    try:
        if genis:
            sonuc8 = test8_bolum_bazli(genis["per_bolum"])
    except Exception as exc:
        print(f"  TEST 8 BAŞARISIZ: {exc}")

    try:
        if genis:
            sonuc9 = test9_optimal_alpha(genis["positives"], genis["negatives"])
    except Exception as exc:
        print(f"  TEST 9 BAŞARISIZ: {exc}")

    print("\n═══ GRAFİKLER OLUŞTURULUYOR ═══")
    try:
        if sonuc1:
            grafik1_confusion_matrix(sonuc1)
            print("  ✓ test_g1_siniflandirma.png")
    except Exception as exc:
        print(f"  ✗ Grafik 1 hatası: {exc}")

    try:
        if sonuc1:
            grafik2_tip_dogruluk(sonuc1)
            print("  ✓ test_g2_siniflandirma_tip.png")
    except Exception as exc:
        print(f"  ✗ Grafik 2 hatası: {exc}")

    try:
        if sonuc2 and sonuc3 and sonuc4 and sonuc6:
            grafik3_skor_dagilimi(sonuc2["skorlar"], sonuc3["skorlar"],
                                   sonuc4["skorlar"], sonuc6["optimal"]["esik"])
            print("  ✓ test_g3_skor_dagilimi.png")
    except Exception as exc:
        print(f"  ✗ Grafik 3 hatası: {exc}")

    try:
        if sonuc6:
            grafik4_esik_analizi(sonuc6)
            print("  ✓ test_g4_esik_analizi.png")
    except Exception as exc:
        print(f"  ✗ Grafik 4 hatası: {exc}")

    try:
        if sonuc5:
            grafik5_edge_cases(sonuc5)
            print("  ✓ test_g5_edge_cases.png")
    except Exception as exc:
        print(f"  ✗ Grafik 5 hatası: {exc}")

    try:
        if sonuc1 and sonuc2 and sonuc3 and sonuc6 and sonuc5:
            grafik6_ozet_tablo(sonuc1, sonuc2, sonuc3, sonuc6, sonuc5)
            print("  ✓ test_g6_ozet_tablo.png")
    except Exception as exc:
        print(f"  ✗ Grafik 6 hatası: {exc}")

    try:
        if sonuc7:
            grafik7_hybrid(sonuc7)
            print("  ✓ test_g7_hybrid.png")
    except Exception as exc:
        print(f"  ✗ Grafik 7 hatası: {exc}")

    try:
        if sonuc8:
            grafik8_bolum_bazli(sonuc8)
            print("  ✓ test_g8_bolum_bazli.png")
    except Exception as exc:
        print(f"  ✗ Grafik 8 hatası: {exc}")

    try:
        if sonuc9:
            grafik9_alpha(sonuc9)
            print("  ✓ test_g9_alpha.png")
    except Exception as exc:
        print(f"  ✗ Grafik 9 hatası: {exc}")

    print("\n═══ GENEL ÖZET ═══")
    if sonuc1:
        print(f"  Sınıflandırma doğruluğu : %{sonuc1['toplam_dogruluk']:.1f}")
    if sonuc2:
        print(f"  Pozitif ort. skor       : {sonuc2['ortalama']:.4f}")
    if sonuc3:
        print(f"  Negatif ort. skor       : {sonuc3['ortalama']:.4f}")
    if sonuc6:
        print(f"  Optimal eşik            : {sonuc6['optimal']['esik']:.2f} "
              f"(F1={sonuc6['optimal']['f1']:.3f})")
    if sonuc5:
        print(f"  Edge case doğruluğu     : %{sonuc5['genel_dogruluk']:.1f}")
    if sonuc7:
        print(f"  BM25 kısaltma doğruluğu : %{sonuc7['bm25_dogruluk']:.1f} "
              f"(SBERT %{sonuc7['sbert_dogruluk']:.1f}, Hibrit %{sonuc7['hibrit_dogruluk']:.1f})")
    if sonuc9:
        print(f"  En iyi alpha            : {sonuc9['en_iyi']['alpha']:.1f} "
              f"(F1={sonuc9['en_iyi']['f1']:.3f})")
    print("\nTest paketi v2 tamamlandı.")


if __name__ == "__main__":
    main()

"""DöngüNet SBERT Eşleştirme Motoru — Görsel Test Raporu.

30 eşleştirme çifti üzerinde motor performansını test eder.
3 grafik üretir: skor dağılımı, çift detay, özet tablo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import numpy as np
import matplotlib
matplotlib.use("Agg")  # GUI olmadan dosyaya kaydet
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from app.embedder import embedder, build_text, enrich_text
# ── Model yükle ──
embedder.load()

# ── 30 test çifti ──
test_pairs = [
    # (çıktı, girdi, etiket, kısa_ad)
    # KEsin eşleşme — etiket 1
    ("Alüminyum ekstrüzyon profillerinin 6063 alaşım kafa-kuyruk kesim kalıntıları",
     "İkincil alüminyum ergitme tesisi için 6063 alaşım şarj hammaddesi", 1, "Al 6063 ↔ Al ergitme"),
    ("Otomotiv yan sanayi pres hattı DKP sac parça atıkları",
     "Çelik dökümhane indüksiyon ocağı için temiz ferrous şarj hurdası", 1, "DKP sac ↔ çelik şarj"),
    ("Kablo sıyırma tesisinden elde edilen yüksek saflıkta kırma bakır granülü",
     "Bakır rafinasyon ve ergitme tesisi için granül bakır girdisi", 1, "Cu granül ↔ Cu ergitme"),
    ("Baskısız LDPE streç film ve ambalaj paketleme hattı kesim firesi",
     "LDPE film geri dönüşüm hattı için temiz film hurdası", 1, "LDPE film ↔ LDPE geri dön."),
    ("PET levha termoform üretiminden çıkan gıda ile temas etmemiş iskelet firesi",
     "PET regranülasyon prosesi için temiz levha firesi", 1, "PET levha ↔ PET regranül"),
    ("Konfeksiyon dikim atölyesinden çıkan pamuklu denim kumaş kırpıntıları",
     "Rejenere pamuk elyaf ve şoddy iplik üretimi için tekstil kırpıntısı", 1, "Denim ↔ şoddy iplik"),
    ("Isıcam üretim hattı CNC kesim sonrası şeffaf soda-kireç düz cam kırıkları",
     "Cam ambalaj fırını için soda-kireç cullet besleme materyali", 1, "Cam kırık ↔ cullet"),
    ("Kraft torba üretiminden çıkan temiz kraft kağıt kenar fireleri",
     "Geri dönüştürülmüş kraft liner ve oluklu mukavva hamuru üretimi", 1, "Kraft ↔ mukavva hamuru"),
    ("Şeker pancarı işleme sonrası oluşan küspe",
     "Peletlenmiş büyükbaş hayvan yemi üretimi için lifli organik yan ürün", 1, "Küspe ↔ hayvan yemi"),
    ("Boya imalat hattı solvent bazlı tiner ve reaktör yıkama atık solventi",
     "Solvent distilasyon tesisinde geri kazanılabilir organik çözücü girdisi", 1, "Solvent ↔ distilasyon"),
    # Sınırda — etiket 0.5
    ("Alüminyum döküm ocaklarında yüzeyden alınan oksitli dross ve metalik kül",
     "İkincil alüminyum ergitme tesisi için temiz alüminyum şarj hammaddesi", 0.5, "Al dross ↔ Al şarj"),
    ("Dökümhane kaynaklı metal oksit ve kullanılmış döküm kumu karışımı",
     "Çimento fabrikası mineral katkı ve alternatif hammadde girdisi", 0.5, "Döküm kumu ↔ çimento"),
    ("Otomotiv temperli cam kenar taşlama sulu cam tozu çamuru",
     "Yol alt temel veya beton dolgu malzemesi için mineral ince agrega", 0.5, "Cam tozu ↔ agrega"),
    ("PE kaplamalı karton kırpıntıları",
     "Selüloz bazlı yumurta viyolü ve karton ambalaj hamuru üretimi", 0.5, "PE karton ↔ viyol"),
    ("Pamuk polyester karışımlı örme kumaş kesim artıkları",
     "Mekanik elyaf açma ile rejenere tekstil elyafı üretim hattı", 0.5, "CO/PES ↔ rejenere"),
    ("Halı dokuma hattı kenar kesim PP iplik ve jüt taban atıkları",
     "Plastik kompozit profil üretimi için lifli dolgu polimer katkı", 0.5, "Halı PP ↔ kompozit"),
    ("Biodizel üretiminden çıkan ham gliserin yan ürünü",
     "Kimyasal proses için rafine gliserin hammaddesi", 0.5, "Ham glis. ↔ rafine glis."),
    ("PVC pencere profil üretim hattı başlatma firesi ve profil kırıkları",
     "PVC zemin kaplama ve lambri üretimi için kırma hammadde", 0.5, "PVC profil ↔ PVC zemin"),
    ("Kağıt fabrikası elek altı selüloz lif çamuru",
     "Tuğla veya çimento üretiminde organik mineral katkı girdisi", 0.5, "Lif çamur ↔ tuğla"),
    ("Kullanılmış etilen glikol bazlı antifriz sıvısı",
     "Glikol geri kazanım tesisinde yeniden işlenecek sıvı hammadde", 0.5, "Antifriz ↔ glikol GK"),
    # Kesin eşleşmeme — etiket 0
    ("Mezbaha işkembe içeriği ve gübre karışımı organik atık",
     "Çelik dökümhane indüksiyon ocağı için temiz ferrous şarj hurdası", 0, "Mezbaha ↔ çelik"),
    ("Alüminyum ekstrüzyon 6063 alaşım kesim kalıntıları",
     "Selüloz bazlı yumurta viyolü ve karton ambalaj hamuru üretimi", 0, "Al ↔ viyol"),
    ("Beyaz eşya HDPE kırma parçaları",
     "Çimento klinker öğütme hattı için donma geciktirici alçı taşı", 0, "HDPE ↔ alçı"),
    ("Gıda OSB sebze işleme hattı pırasa lahana kabukları",
     "Cam ambalaj fırını için şeffaf soda-kireç cullet girdisi", 0, "Sebze ↔ cam cullet"),
    ("304 kalite paslanmaz sac kırpıntıları",
     "Peletlenmiş büyükbaş hayvan yemi için lifli katkı girdisi", 0, "İnox ↔ yem"),
    ("Boya imalat hattı solvent bazlı tiner atık solventi",
     "PVC zemin kaplama ve lambri üretimi için kırma hammadde", 0, "Solvent ↔ PVC"),
    ("Halı dokuma PP iplik ve jüt taban atıkları",
     "Bakır rafinasyon ve ergitme tesisi için granül bakır girdisi", 0, "Halı ↔ bakır"),
    ("Ofis arşiv imhasından çıkan kırpılmış A4 kağıtları",
     "Endüstriyel briketleme ve ergitme tesisi için hurda metal girdisi", 0, "Kağıt ↔ metal"),
    ("Parfüm şişesi üretim hattı şeffaf flakon camları",
     "LDPE film geri dönüşüm hattı için temiz film hurdası", 0, "Cam ↔ LDPE"),
    ("Medikal PP nonwoven kumaş fireleri",
     "Biyokütle enerji santrali için odunsu yakıt kaynağı", 0, "PP teks. ↔ biyokütle"),
]

# ── Kosinüs hesapla ──
def cosine(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

# ── Tüm çiftleri skorla ──
results = []
for cikti, girdi, etiket, ad in test_pairs:
    v1 = embedder.encode(enrich_text(cikti))
    v2 = embedder.encode(enrich_text(girdi))
    skor = cosine(v1, v2)
    results.append({"ad": ad, "skor": skor, "etiket": etiket})

print("Skorlar hesaplandı. Grafikler üretiliyor...\n")

# ── Konsol çıktısı ──
esik = 0.60
dogru = yanlis = 0
for r in results:
    eslesir = r["skor"] >= esik
    if r["etiket"] == 1:
        beklenen, grup = True, "Kesin ✓"
    elif r["etiket"] == 0:
        beklenen, grup = False, "Kesin ✗"
    else:
        beklenen, grup = None, "Sınırda"

    if beklenen is None:
        isaret = "~"
    elif eslesir == beklenen:
        isaret = "✓"
        dogru += 1
    else:
        isaret = "✗ YANLIŞ"
        yanlis += 1
    print(f"  {r['ad']:25s} {grup:10s} {r['skor']:.3f}  {'EŞLEŞİR' if eslesir else 'elenir':10s} {isaret}")

print(f"\nKesin çiftlerde doğruluk: {dogru}/{dogru+yanlis} ({100*dogru/(dogru+yanlis):.0f}%)")

# ── Renk ve stil ──
COLORS = {"kesin": "#1D9E75", "sinirda": "#E6A817", "degil": "#D64545"}

# ══════════════════════════════════════════════════════════════
# GRAFİK 1 — Skor dağılım grafiği (gruplar ayrı renk)
# ══════════════════════════════════════════════════════════════
fig1, ax1 = plt.subplots(figsize=(10, 5))

kesin = [r["skor"] for r in results if r["etiket"] == 1]
sinirda = [r["skor"] for r in results if r["etiket"] == 0.5]
degil = [r["skor"] for r in results if r["etiket"] == 0]

ax1.hist(kesin, bins=10, alpha=0.7, color=COLORS["kesin"], label="Kesin eşleşme (1)", edgecolor="white")
ax1.hist(sinirda, bins=10, alpha=0.7, color=COLORS["sinirda"], label="Sınırda (0.5)", edgecolor="white")
ax1.hist(degil, bins=10, alpha=0.7, color=COLORS["degil"], label="Kesin eşleşmeme (0)", edgecolor="white")

ax1.axvline(x=esik, color="#333", linestyle="--", linewidth=2, label=f"Eşik = {esik}")
ax1.set_xlabel("Kosinüs Benzerlik Skoru", fontsize=12)
ax1.set_ylabel("Çift Sayısı", fontsize=12)
ax1.set_title("DöngüNet SBERT Eşleştirme — Skor Dağılımı", fontsize=14, fontweight="bold")
ax1.legend(fontsize=10)
ax1.set_xlim(0, 1)
fig1.tight_layout()
fig1.savefig("grafik_1_skor_dagilimi.png", dpi=150)
print("✓ grafik_1_skor_dagilimi.png kaydedildi")

# ══════════════════════════════════════════════════════════════
# GRAFİK 2 — Yatay çubuk: her çiftin skoru
# ══════════════════════════════════════════════════════════════
fig2, ax2 = plt.subplots(figsize=(10, 12))

adlar = [r["ad"] for r in reversed(results)]
skorlar = [r["skor"] for r in reversed(results)]
renkler = []
for r in reversed(results):
    if r["etiket"] == 1:
        renkler.append(COLORS["kesin"])
    elif r["etiket"] == 0.5:
        renkler.append(COLORS["sinirda"])
    else:
        renkler.append(COLORS["degil"])

bars = ax2.barh(adlar, skorlar, color=renkler, edgecolor="white", height=0.7)
ax2.axvline(x=esik, color="#333", linestyle="--", linewidth=2)
ax2.set_xlabel("Kosinüs Benzerlik Skoru", fontsize=12)
ax2.set_title("DöngüNet — 30 Çift Detaylı Skor Karşılaştırması", fontsize=14, fontweight="bold")
ax2.set_xlim(0, 1)

# Skor değerlerini çubukların ucuna yaz
for bar, skor in zip(bars, skorlar):
    ax2.text(skor + 0.01, bar.get_y() + bar.get_height()/2,
             f"{skor:.3f}", va="center", fontsize=8)

# Lejant
legend_patches = [
    mpatches.Patch(color=COLORS["kesin"], label="Kesin eşleşme"),
    mpatches.Patch(color=COLORS["sinirda"], label="Sınırda"),
    mpatches.Patch(color=COLORS["degil"], label="Kesin eşleşmeme"),
]
ax2.legend(handles=legend_patches, loc="lower right", fontsize=10)
fig2.tight_layout()
fig2.savefig("grafik_2_cift_detay.png", dpi=150)
print("✓ grafik_2_cift_detay.png kaydedildi")

# ══════════════════════════════════════════════════════════════
# GRAFİK 3 — Özet: grup ortalamaları + kutu grafik
# ══════════════════════════════════════════════════════════════
fig3, (ax3a, ax3b) = plt.subplots(1, 2, figsize=(12, 5))

# Sol: Kutu grafik
data_box = [kesin, sinirda, degil]
bp = ax3a.boxplot(data_box, labels=["Kesin\neşleşme", "Sınırda", "Kesin\neşleşmeme"],
                  patch_artist=True, widths=0.5)
box_colors = [COLORS["kesin"], COLORS["sinirda"], COLORS["degil"]]
for patch, color in zip(bp["boxes"], box_colors):
    patch.set_facecolor(color)
    patch.set_alpha(0.7)
ax3a.axhline(y=esik, color="#333", linestyle="--", linewidth=1.5, label=f"Eşik = {esik}")
ax3a.set_ylabel("Kosinüs Benzerlik Skoru", fontsize=11)
ax3a.set_title("Grup Bazlı Skor Dağılımı", fontsize=12, fontweight="bold")
ax3a.legend(fontsize=9)

# Sağ: Özet istatistik tablosu
ax3b.axis("off")
tablo = [
    ["Metrik", "Kesin ✓", "Sınırda", "Kesin ✗"],
    ["Çift sayısı", f"{len(kesin)}", f"{len(sinirda)}", f"{len(degil)}"],
    ["Ortalama skor", f"{np.mean(kesin):.3f}", f"{np.mean(sinirda):.3f}", f"{np.mean(degil):.3f}"],
    ["Min skor", f"{np.min(kesin):.3f}", f"{np.min(sinirda):.3f}", f"{np.min(degil):.3f}"],
    ["Max skor", f"{np.max(kesin):.3f}", f"{np.max(sinirda):.3f}", f"{np.max(degil):.3f}"],
    ["Std sapma", f"{np.std(kesin):.3f}", f"{np.std(sinirda):.3f}", f"{np.std(degil):.3f}"],
    ["Eşik doğruluk", f"{sum(1 for s in kesin if s>=esik)}/{len(kesin)}", "N/A",
     f"{sum(1 for s in degil if s<esik)}/{len(degil)}"],
]
table = ax3b.table(cellText=tablo, loc="center", cellLoc="center")
table.auto_set_font_size(False)
table.set_fontsize(10)
table.scale(1, 1.6)
# Başlık satırı renklendirme
for j in range(4):
    table[0, j].set_facecolor("#E8E8E8")
    table[0, j].set_text_props(fontweight="bold")
ax3b.set_title("Özet İstatistikler", fontsize=12, fontweight="bold")

fig3.suptitle("DöngüNet SBERT — Model Performans Özeti", fontsize=14, fontweight="bold", y=1.02)
fig3.tight_layout()
fig3.savefig("grafik_3_ozet.png", dpi=150, bbox_inches="tight")
print("✓ grafik_3_ozet.png kaydedildi")

print("\n✅ Tüm grafikler proje klasörüne kaydedildi.")
print("   → grafik_1_skor_dagilimi.png")
print("   → grafik_2_cift_detay.png")
print("   → grafik_3_ozet.png")
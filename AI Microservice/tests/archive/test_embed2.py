"""İki pasaportu vektörleyip benzerliklerini ölç — eşleştirmenin özü."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import numpy as np
from app.embedder import embedder, build_text


def cosine(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


embedder.load()

# Bir ÇIKTI (bir fabrikanın yan ürünü)
cikti = {
    "material_class": "Metal - Alaşımlı toz",
    "physical_form": "İnce toz 80μm",
    "composition": "Fe %71, Al %16",
    "quality_notes": "Saflık %87",
}

# Üç aday GİRDİ (başka fabrikaların ihtiyaçları)
adaylar = {
    "Çok benzer": {
        "material_class": "Metal tozu - demir alaşımı",
        "physical_form": "Toz formu, ince",
        "composition": "Demir %70, Alüminyum %15",
    },
    "Orta benzer": {
        "material_class": "Hurda metal",
        "composition": "Karışık metal içerikli",
    },
    "Alakasız": {
        "material_class": "Organik atık - gıda",
        "composition": "Sebze ve meyve artıkları",
    },
}

v_cikti = embedder.encode(build_text(cikti))

print(f"ÇIKTI: {build_text(cikti)}\n")
for ad, girdi in adaylar.items():
    v_girdi = embedder.encode(build_text(girdi))
    skor = cosine(v_cikti, v_girdi)
    esik = "✓ EŞLEŞİR" if skor > 0.65 else "✗ elenir"
    print(f"{ad:12s} → benzerlik {skor:.3f}  {esik}")
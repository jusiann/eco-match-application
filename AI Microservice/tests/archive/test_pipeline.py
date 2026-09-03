"""Uçtan uca eşleştirme senaryosu — birden fazla tesis, gerçek akış."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from app.embedder import embedder, build_text
from app.vector_store import vector_store

embedder.load()

# --- Senaryo: 4 farklı tesisin GİRDİ ihtiyaçları depoya kaydedilir ---
girdiler = {
    101: {  # Döküm fabrikası — metal tozu arıyor
        "material_class": "Metal tozu - demir alaşımı",
        "physical_form": "Toz formu, ince",
        "composition": "Demir %70, Alüminyum %15",
    },
    102: {  # Geri dönüşüm tesisi — hurda metal
        "material_class": "Hurda metal",
        "composition": "Karışık metal içerikli",
    },
    103: {  # Plastik üreticisi — PET arıyor
        "material_class": "Plastik - PET granül",
        "composition": "Polietilen tereftalat",
    },
    104: {  # Kompost tesisi — organik atık
        "material_class": "Organik atık - gıda",
        "composition": "Sebze ve meyve artıkları",
    },
}

# Her girdiyi vektörle ve depoya ekle (gerçekte: materials/inputs POST anında)
print("=== Girdiler depoya yükleniyor ===")
for rid, passport in girdiler.items():
    vector = embedder.encode(build_text(passport))
    vector_store.add(record_id=rid, record_type="input", vector=vector)
print(f"Depoda {vector_store.count()} girdi var.\n")

# --- Bir tesis ÇIKTI kaydeder ve eşleştirme ister ---
cikti = {
    "material_class": "Metal - Alaşımlı toz",
    "physical_form": "İnce toz 80μm",
    "composition": "Fe %71, Al %16",
    "quality_notes": "Saflık %87",
}

print(f"=== ÇIKTI: {build_text(cikti)} ===")
print("Bu çıktıya en uygun girdiler aranıyor...\n")

query_vector = embedder.encode(build_text(cikti))
sonuclar = vector_store.search(
    query_vector=query_vector,
    record_type="input",   # girdileri ara
    threshold=0.65,
    limit=20,
)

# Sonuçları okunaklı yazdır
isimler = {101: "Döküm fabrikası", 102: "Geri dönüşüm",
           103: "Plastik üreticisi", 104: "Kompost tesisi"}
if not sonuclar:
    print("Eşik üstünde aday bulunamadı.")
for r in sonuclar:
    rid = r["record_id"]
    print(f"  #{rid} {isimler[rid]:18s} → benzerlik {r['similarity']:.3f}")
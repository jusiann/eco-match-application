"""Embedding mantık testi — benzer malzemeler yakın mı?"""
import sys
from pathlib import Path

# tests/archive/ içinden çalıştırıldığında proje kökünü (app paketinin
# bulunduğu yer) sys.path'e ekle — aksi halde "app" modülü bulunamaz.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import numpy as np
from app.embedder import embedder


def cosine(a: list[float], b: list[float]) -> float:
    """İki vektör arası kosinüs benzerliği (1=aynı, 0=alakasız)."""
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


# Modeli yükle (servisten bağımsız, doğrudan)
embedder.load()

# Test çiftleri: benzer olmalı vs alakasız olmalı
celik_talas = embedder.encode("Paslanmaz çelik talaşı, 304 kalite")
metal_artik = embedder.encode("304 kalite metal artığı, talaş formunda")
plastik     = embedder.encode("PET plastik şişe kırıkları, gıda dışı")

benzer    = cosine(celik_talas, metal_artik)
alakasiz  = cosine(celik_talas, plastik)

print(f"Çelik talaşı ↔ metal artığı (benzer olmalı):  {benzer:.3f}")
print(f"Çelik talaşı ↔ plastik     (alakasız olmalı): {alakasiz:.3f}")
print(f"\n{'BAŞARILI ✓' if benzer > alakasiz else 'SORUN ✗ — model beklendiği gibi çalışmıyor'}")
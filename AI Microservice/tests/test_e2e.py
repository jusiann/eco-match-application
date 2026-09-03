"""DöngüNet AI — Uçtan uca (E2E) entegrasyon testi.

Senaryo: "İki OSB'deki 6 tesisin malzeme eşleştirmesi"

Servisin (localhost:8000) canlı HTTP endpoint'lerine gerçek istekler atar.
pgvector'a test verisi yazmak/temizlemek için doğrudan `vector_store`
kullanılır — bunun için ayrı bir HTTP endpoint'i yok.

ÇALIŞTIRMA: Önce servisi başlatın (ör. `uvicorn app.main:app`), sonra:
    python tests/test_e2e.py
(Bu script sadece OLUŞTURULMUŞTUR — kullanıcı kendisi çalıştıracaktır.)
"""
import sys
import time
from pathlib import Path

import requests

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

# tests/ içinden çalıştırıldığında proje kökünü (app paketinin bulunduğu
# yer) sys.path'e ekle — aksi halde "app" modülü bulunamaz.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE_URL = "http://127.0.0.1:8000"  # "localhost" Windows'ta önce IPv6 deneyip yavaşlayabiliyor
TIMEOUT = 30  # saniye
ON_KONTROL_TIMEOUT = 3  # saniye — servis ayakta değilse hızlı anla

try:
    from app.vector_store import vector_store
except ImportError as exc:
    print(f"═══ HATA: app.vector_store içe aktarılamadı: {exc} ═══")
    print("Bu scripti proje kök dizininde, doğru sanal ortamda çalıştırın.")
    sys.exit(1)


# --- Test verisi: iki OSB'deki 5 tesis + eşleştirme senaryoları ------------

TESISLER = {
    "a_dokum": {
        "ad": "Döküm fabrikası",
        "passport": {"material_class": "Metal tozu - demir alaşımı", "composition": "Fe%70 Al%15"},
    },
    "b_plastik": {
        "ad": "Plastik geri dönüşüm",
        "passport": {"material_class": "Plastik - PET granül"},
    },
    "c_kagit": {
        "ad": "Kağıt fabrikası",
        "passport": {"material_class": "Kraft selüloz lif"},
    },
    "d_cam": {
        "ad": "Cam üretim",
        "passport": {"material_class": "Soda-kireç cullet"},
    },
    "e_kompost": {
        "ad": "Kompost tesisi",
        "passport": {"material_class": "Organik bitkisel atık"},
    },
}
RECORD_TYPE = "output"
RECORD_ID_PREFIX = "e2e_test_"

SINIFLANDIRMA_ORNEKLERI = [
    ("çelik talaşı", "METAL"),
    ("bakır kablo hurda", "METAL"),
    ("PET şişe kırığı", "PLASTIK"),
    ("LDPE film fire", "PLASTIK"),
    ("elma posası", "ORGANIK"),
    ("atık solvent tiner", "KIMYASAL"),
    ("pamuk kumaş kırpıntısı", "TEKSTIL"),
    ("cam şişe kırığı", "CAM"),
    ("karton mukavva fire", "KAGIT"),
    ("DKP sac hurda", "METAL"),
]

# --- Ortak durum ------------------------------------------------------------

sonuclar: list[tuple[str, bool]] = []
toplam_sure_ms = 0.0
kayitli_id_ler: list[str] = []  # temizlik için pgvector'a yazılan kayıtlar


def olc(fn, *args, **kwargs):
    """Bir fonksiyonu çalıştır, sonucu ve geçen süreyi (ms) döndür."""
    global toplam_sure_ms
    t0 = time.time()
    sonuc = fn(*args, **kwargs)
    gecen_ms = (time.time() - t0) * 1000
    toplam_sure_ms += gecen_ms
    return sonuc, gecen_ms


def istek(method: str, path: str, **kwargs):
    """HTTP isteği at. Bağlantı hatasında None döndür — script çökmesin,
    diğer testler devam edebilsin."""
    url = f"{BASE_URL}{path}"
    try:
        return requests.request(method, url, timeout=TIMEOUT, **kwargs)
    except requests.exceptions.RequestException as exc:
        print(f"  ! HTTP hatası ({method} {path}): {exc}")
        return None


# --- TEST 1: Sağlık kontrolü ------------------------------------------------

def test1_saglik() -> bool:
    print("\n═══ TEST 1: Sağlık Kontrolü ═══")
    resp, ms = olc(istek, "GET", "/health")
    if resp is None:
        print(f"  Adım 1: GET /health → bağlantı hatası ✗ ({ms:.1f} ms)")
        return False
    if resp.status_code != 200:
        print(f"  Adım 1: GET /health → HTTP {resp.status_code} ✗ ({ms:.1f} ms)")
        return False

    data = resp.json()
    beklenen = {"model_loaded": True, "db_connected": True, "classifier_ready": True}
    basarili = all(data.get(k) == v for k, v in beklenen.items())
    print(f"  Adım 1: GET /health → model_loaded={data.get('model_loaded')} "
          f"db_connected={data.get('db_connected')} classifier_ready={data.get('classifier_ready')} "
          f"{'✓' if basarili else '✗'} ({ms:.1f} ms)")
    return basarili


# --- TEST 2: Tesis pasaportlarını vektörle ve kaydet ------------------------

def test2_tesisleri_kaydet() -> bool:
    print("\n═══ TEST 2: 5 Tesis Pasaportunu Vektörle ve pgvector'a Kaydet ═══")
    try:
        vector_store.connect()
    except Exception as exc:
        print(f"  ! pgvector bağlantı hatası: {exc} ✗")
        return False

    hepsi_basarili = True
    for key, tesis in TESISLER.items():
        resp, ms = olc(istek, "POST", "/embed/passport", json=tesis["passport"])
        if resp is None or resp.status_code != 200:
            kod = resp.status_code if resp is not None else "bağlantı yok"
            print(f"  {tesis['ad']:<24} POST /embed/passport → HTTP {kod} ✗ ({ms:.1f} ms)")
            hepsi_basarili = False
            continue

        data = resp.json()
        vector = data["vector"]
        record_id = f"{RECORD_ID_PREFIX}{key}"
        try:
            vector_store.add(record_id, RECORD_TYPE, vector)
            kayitli_id_ler.append(record_id)
            print(f"  {tesis['ad']:<24} POST /embed/passport → dim={data['dim']}, "
                  f"pgvector'a yazıldı (id={record_id}) ✓ ({ms:.1f} ms)")
        except Exception as exc:
            print(f"  {tesis['ad']:<24} pgvector yazma hatası: {exc} ✗")
            hepsi_basarili = False

    return hepsi_basarili


# --- TEST 3: Sınıflandır + eşleştir (tam senaryo) --------------------------

def test3_tam_senaryo() -> bool:
    print("\n═══ TEST 3: Sınıflandır + Eşleştir (Tam Senaryo) ═══")
    metin = "CNC talaşı, 304 paslanmaz, yağlı"
    basarili = True

    resp, ms = olc(istek, "POST", "/classify", json={"text": metin})
    if resp is None or resp.status_code != 200:
        print(f"  Adım 1: POST /classify → HATA ✗ ({ms:.1f} ms)")
        return False
    kategori = resp.json()["category"]
    kategori_dogru = kategori == "METAL"
    print(f"  Adım 1: POST /classify(\"{metin}\") → kategori={kategori} "
          f"{'✓' if kategori_dogru else '✗'} ({ms:.1f} ms)")
    basarili = basarili and kategori_dogru

    resp, ms = olc(istek, "POST", "/search", json={
        "text": metin, "record_type": RECORD_TYPE, "threshold": 0.0, "limit": 20,
    })
    if resp is None or resp.status_code != 200:
        print(f"  Adım 2: POST /search → HATA ✗ ({ms:.1f} ms)")
        return False

    sonuc_listesi = sorted(resp.json()["results"], key=lambda r: r["similarity"], reverse=True)
    hedef_id = f"{RECORD_ID_PREFIX}a_dokum"
    top1_id = sonuc_listesi[0]["record_id"] if sonuc_listesi else None
    en_ustte_mi = top1_id == hedef_id
    hedef_skor = next((r["similarity"] for r in sonuc_listesi if r["record_id"] == hedef_id), None)
    print(f"  Adım 2: POST /search → top1={top1_id} (döküm fabrikası skoru={hedef_skor}) "
          f"{'✓' if en_ustte_mi else '✗'} ({ms:.1f} ms)")
    basarili = basarili and en_ustte_mi

    return basarili


# --- TEST 4: Çapraz kategori red --------------------------------------------

def test4_capraz_kategori_red() -> bool:
    print("\n═══ TEST 4: Çapraz Kategori Red ═══")
    metin = "meyve posası, elma"
    basarili = True

    resp, ms = olc(istek, "POST", "/classify", json={"text": metin})
    if resp is None or resp.status_code != 200:
        print(f"  Adım 1: POST /classify → HATA ✗ ({ms:.1f} ms)")
        return False
    kategori = resp.json()["category"]
    kategori_dogru = kategori == "ORGANIK"
    print(f"  Adım 1: POST /classify(\"{metin}\") → kategori={kategori} "
          f"{'✓' if kategori_dogru else '✗'} ({ms:.1f} ms)")
    basarili = basarili and kategori_dogru

    resp, ms = olc(istek, "POST", "/search", json={
        "text": metin, "record_type": RECORD_TYPE, "threshold": 0.0, "limit": 50,
    })
    if resp is None or resp.status_code != 200:
        print(f"  Adım 2: POST /search → HATA ✗ ({ms:.1f} ms)")
        return False

    sonuc_listesi = resp.json()["results"]
    hedef_id = f"{RECORD_ID_PREFIX}a_dokum"  # metal tesis — organik girdiyle eşleşmemeli
    hedef_kayit = next((r for r in sonuc_listesi if r["record_id"] == hedef_id), None)

    if hedef_kayit is None:
        print(f"  Adım 2: POST /search(\"{metin}\") metal tesisler arasında → "
              f"döküm fabrikası hiç dönmedi ✓ ({ms:.1f} ms)")
        red_basarili = True
    else:
        skor = hedef_kayit["similarity"]
        red_basarili = skor < 0.40
        print(f"  Adım 2: POST /search(\"{metin}\") metal tesisler arasında → "
              f"döküm fabrikası skoru={skor:.4f} {'✓ (düşük)' if red_basarili else '✗ (beklenenden yüksek)'} "
              f"({ms:.1f} ms)")
    basarili = basarili and red_basarili

    return basarili


# --- TEST 5 / 6 ortak: sınıflandırma doğruluğu ------------------------------

def siniflandirma_testlerini_calistir(baslik: str) -> bool:
    print(f"\n═══ {baslik} ═══")
    dogru_sayisi = 0
    for metin, beklenen in SINIFLANDIRMA_ORNEKLERI:
        resp, ms = olc(istek, "POST", "/classify", json={"text": metin})
        if resp is None or resp.status_code != 200:
            print(f"  \"{metin:<28}\" → HATA ✗ ({ms:.1f} ms)")
            continue
        tahmin = resp.json()["category"]
        dogru = tahmin == beklenen
        if dogru:
            dogru_sayisi += 1
        print(f"  \"{metin:<28}\" → {tahmin:<10} (beklenen={beklenen}) "
              f"{'✓' if dogru else '✗'} ({ms:.1f} ms)")

    toplam = len(SINIFLANDIRMA_ORNEKLERI)
    oran = dogru_sayisi / toplam * 100
    print(f"  Doğruluk: {dogru_sayisi}/{toplam} (%{oran:.1f})")
    return dogru_sayisi == toplam


def test5_on_siniflandirma() -> bool:
    return siniflandirma_testlerini_calistir("TEST 5: 10 Sınıflandırma Testi")


# --- TEST 6: Prototip güncelleme --------------------------------------------

def test6_prototip_guncelleme() -> bool:
    print("\n═══ TEST 6: Prototip Güncelleme ═══")
    yeni_ornek = "CNC işleme merkezinden çıkan yağlı 304 paslanmaz çelik talaşı"

    resp, ms = olc(istek, "POST", "/reload-prototypes", json={
        "category": "METAL", "examples": [yeni_ornek],
    })
    if resp is None or resp.status_code != 200:
        print(f"  Adım 1: POST /reload-prototypes → HATA ✗ ({ms:.1f} ms)")
        return False

    data = resp.json()
    print(f"  Adım 1: POST /reload-prototypes → toplam_örnek={data.get('total_examples')} "
          f"yeni_eklenen={data.get('new_added')} ✓ ({ms:.1f} ms)")

    tekrar_basarili = siniflandirma_testlerini_calistir(
        "TEST 6 (devam): Güncelleme Sonrası Sınıflandırma"
    )
    return tekrar_basarili


# --- Temizlik ----------------------------------------------------------------

def temizlik() -> None:
    print("\n═══ TEMİZLİK: Test Verilerini pgvector'dan Sil ═══")
    if not kayitli_id_ler:
        print("  Silinecek kayıt yok.")
        return
    for record_id in kayitli_id_ler:
        try:
            vector_store.delete(record_id)
            print(f"  Silindi: {record_id}")
        except Exception as exc:
            print(f"  ! Silme hatası ({record_id}): {exc}")


# --- Ana akış ----------------------------------------------------------------

def servis_ayakta_mi() -> bool:
    """Testlere başlamadan önce servisin ayakta olup olmadığını hızlıca kontrol et.

    Servis kapalıyken her istek birkaç saniye sürebiliyor (WinError 10061
    öncesi bağlantı denemeleri) — 6 testin tamamını tek tek beklemek yerine
    burada tek seferde erken ve net bir hata ver.
    """
    try:
        requests.get(f"{BASE_URL}/health", timeout=ON_KONTROL_TIMEOUT)
        return True
    except requests.exceptions.RequestException:
        return False


def main() -> None:
    print("DöngüNet AI — Uçtan Uca Entegrasyon Testi")
    print(f"Hedef: {BASE_URL}")
    print("Senaryo: İki OSB'deki 6 tesisin malzeme eşleştirmesi")

    if not servis_ayakta_mi():
        print(f"\n═══ HATA: Servise ulaşılamıyor ({BASE_URL}) ═══")
        print("Servis çalışmıyor olabilir. Önce başlatın, ör.:")
        print("  uvicorn app.main:app --host 127.0.0.1 --port 8000")
        print("Sonra bu scripti tekrar çalıştırın.")
        sys.exit(1)

    testler = [
        ("TEST 1: Sağlık Kontrolü", test1_saglik),
        ("TEST 2: Tesisleri Kaydet", test2_tesisleri_kaydet),
        ("TEST 3: Tam Senaryo (Sınıflandır + Eşleştir)", test3_tam_senaryo),
        ("TEST 4: Çapraz Kategori Red", test4_capraz_kategori_red),
        ("TEST 5: 10 Sınıflandırma Testi", test5_on_siniflandirma),
        ("TEST 6: Prototip Güncelleme", test6_prototip_guncelleme),
    ]

    try:
        for isim, fn in testler:
            try:
                basarili = fn()
            except Exception as exc:
                print(f"  ! {isim} sırasında beklenmeyen hata: {exc}")
                basarili = False
            sonuclar.append((isim, basarili))
    finally:
        temizlik()

    print("\n═══ SONUÇ ═══")
    for isim, basarili in sonuclar:
        print(f"  {'✓' if basarili else '✗'} {isim}")

    gecen = sum(1 for _, b in sonuclar if b)
    print(f"Geçen: {gecen}/{len(sonuclar)}")
    print(f"Süre toplam: {toplam_sure_ms:.1f} ms")


if __name__ == "__main__":
    main()

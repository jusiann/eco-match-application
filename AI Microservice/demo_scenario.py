"""DöngüNet AI — MVP canlı demo senaryosu.

Senaryo: "İki OSB'deki 6 tesisin malzeme eşleştirmesi"

OSB-1 (Gebze) tesisleri ÇIKTI üretir, OSB-2 (Kocaeli) tesisleri bu çıktıları
GİRDİ olarak arar. Servis sınıflandırma (fine-tuned model yerine kendi
modeliyle) ve eşleştirmeyi (fine-tuned SBERT + pgvector) canlı olarak yapar.

ÇALIŞTIRMA: Önce servisi başlatın (ör. `uvicorn app.main:app`), sonra:
    python demo_scenario.py
Sunum sırasında her adımda Enter'a basılarak ilerlenir.
"""
import sys
import time

import requests

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

# Windows'un klasik konsolunda (cmd.exe) ANSI kaçış dizilerini etkinleştirir.
# Windows Terminal / PowerShell 7+'ta zaten gerekmez ama zararsızdır.
import os
if os.name == "nt":
    os.system("")

try:
    from app.vector_store import vector_store
    from app.embedder import enrich_text
except ImportError as exc:
    print(f"═══ HATA: app modülleri içe aktarılamadı: {exc} ═══")
    print("Bu scripti proje kök dizininde, doğru sanal ortamda çalıştırın.")
    sys.exit(1)

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30
SAGLIK_TIMEOUT = 3

# --- ANSI renkleri -----------------------------------------------------------

RESET = "\033[0m"
BOLD = "\033[1m"
YESIL = "\033[92m"
KIRMIZI = "\033[91m"
MAVI = "\033[94m"
SARI = "\033[93m"
CYAN = "\033[96m"
GRI = "\033[90m"


def baslik(metin: str) -> None:
    print(f"\n{BOLD}{CYAN}═══ {metin} ═══{RESET}")


def bilgi(metin: str) -> None:
    print(f"{MAVI}➤ {metin}{RESET}")


def basarili(metin: str) -> None:
    print(f"{YESIL}✓ {metin}{RESET}")


def basarisiz(metin: str) -> None:
    print(f"{KIRMIZI}✗ {metin}{RESET}")


def sure_yaz(ms: float) -> str:
    return f"{GRI}({ms:.1f} ms){RESET}"


def bekle(adim_baslik: str) -> None:
    baslik(adim_baslik)
    input(f"{SARI}[Enter'a basın...]{RESET}")


def olc(fn, *args, **kwargs):
    """Bir fonksiyonu çalıştır, sonucu ve geçen süreyi (ms) döndür."""
    t0 = time.time()
    sonuc = fn(*args, **kwargs)
    gecen_ms = (time.time() - t0) * 1000
    return sonuc, gecen_ms


def istek(method: str, path: str, **kwargs):
    """HTTP isteği at. Bağlantı hatasında None döndür."""
    url = f"{BASE_URL}{path}"
    try:
        return requests.request(method, url, timeout=TIMEOUT, **kwargs)
    except requests.exceptions.RequestException as exc:
        basarisiz(f"HTTP hatası ({method} {path}): {exc}")
        return None


def servis_ayakta_mi() -> bool:
    try:
        requests.get(f"{BASE_URL}/health", timeout=SAGLIK_TIMEOUT)
        return True
    except requests.exceptions.RequestException:
        return False


# --- Demo verisi --------------------------------------------------------------

RECORD_ID_PREFIX = "demo_"

# OSB-1 (Gebze) — çıktı üreten tesisler
OSB1_TESISLER = {
    "a_metal": {"ad": "Tesis A — Metal işleme", "cikti": "304 paslanmaz çelik CNC talaşı, kuru"},
    "b_plastik": {"ad": "Tesis B — Plastik enjeksiyon", "cikti": "PP enjeksiyon çapak ve yolluk"},
    "c_organik": {"ad": "Tesis C — Gıda üretim", "cikti": "meyve suyu pres posası, elma armut"},
}

# OSB-2 (Kocaeli) — girdi arayan tesisler
OSB2_TESISLER = {
    "d_metal": {"ad": "Tesis D — Çelik döküm", "girdi": "ferrous metal hurda, şarj malzemesi"},
    "e_plastik": {"ad": "Tesis E — Plastik geri dönüşüm", "girdi": "temiz PP granül hammadde"},
    "f_organik": {"ad": "Tesis F — Biyogaz tesisi", "girdi": "organik biyokütle, fermantasyon beslemesi"},
}

# Eşleştirme senaryoları: (çıktı_key, beklenen_girdi_key, kategori_etiketi)
ESLESTIRME_SENARYOLARI = [
    ("a_metal", "d_metal", "metal ↔ metal"),
    ("b_plastik", "e_plastik", "plastik ↔ plastik"),
    ("c_organik", "f_organik", "organik ↔ organik"),
]

kayitli_id_ler: list[str] = []  # temizlik için pgvector'a yazılan kayıtlar


# --- ADIM 1: Çıktıları sınıflandır -------------------------------------------

def adim1_siniflandir() -> None:
    bekle("ADIM 1/7: Tesislerin çıktıları sınıflandırılıyor...")
    for key, tesis in OSB1_TESISLER.items():
        resp, ms = olc(istek, "POST", "/classify", json={"text": tesis["cikti"]})
        if resp is None or resp.status_code != 200:
            basarisiz(f"{tesis['ad']:<28} sınıflandırılamadı {sure_yaz(ms)}")
            continue
        data = resp.json()
        basarili(
            f"{tesis['ad']:<28} \"{tesis['cikti']}\" → "
            f"{BOLD}{data['category']}{RESET}{YESIL} (güven={data['confidence']:.2f}) {sure_yaz(ms)}"
        )


# --- ADIM 2: Çıktıları vektörle ve pgvector'a yaz ----------------------------

def adim2_ciktilari_kaydet() -> None:
    bekle("ADIM 2/7: Çıktılar vektörleniyor ve pgvector'a yazılıyor...")
    for key, tesis in OSB1_TESISLER.items():
        metin = enrich_text(tesis["cikti"])
        resp, ms = olc(istek, "POST", "/embed", json={"text": metin})
        if resp is None or resp.status_code != 200:
            basarisiz(f"{tesis['ad']:<28} vektörlenemedi {sure_yaz(ms)}")
            continue
        vector = resp.json()["vector"]
        record_id = f"{RECORD_ID_PREFIX}{key}"
        vector_store.add(record_id, "output", vector)
        kayitli_id_ler.append(record_id)
        basarili(f"{tesis['ad']:<28} → pgvector'a yazıldı (id={record_id}) {sure_yaz(ms)}")


# --- ADIM 3: Girdileri vektörle ve pgvector'a yaz ----------------------------

def adim3_girdileri_kaydet() -> None:
    bekle("ADIM 3/7: Girdiler vektörleniyor ve pgvector'a yazılıyor...")
    for key, tesis in OSB2_TESISLER.items():
        metin = enrich_text(tesis["girdi"])
        resp, ms = olc(istek, "POST", "/embed", json={"text": metin})
        if resp is None or resp.status_code != 200:
            basarisiz(f"{tesis['ad']:<28} vektörlenemedi {sure_yaz(ms)}")
            continue
        vector = resp.json()["vector"]
        record_id = f"{RECORD_ID_PREFIX}{key}"
        vector_store.add(record_id, "input", vector)
        kayitli_id_ler.append(record_id)
        basarili(f"{tesis['ad']:<28} → pgvector'a yazıldı (id={record_id}) {sure_yaz(ms)}")


# --- ADIM 4-6: Eşleştirme -----------------------------------------------------

def eslestirme_adimi(adim_no: int, cikti_key: str, beklenen_girdi_key: str, etiket: str) -> None:
    cikti_tesis = OSB1_TESISLER[cikti_key]
    beklenen_tesis = OSB2_TESISLER[beklenen_girdi_key]
    bekle(f"ADIM {adim_no}/7: Eşleştirme — {cikti_tesis['ad']} (çıktı) için uygun girdi aranıyor...")

    metin = enrich_text(cikti_tesis["cikti"])
    resp, ms1 = olc(istek, "POST", "/search", json={
        "text": metin, "record_type": "input", "threshold": 0.0, "limit": 20,
    })
    if resp is None or resp.status_code != 200:
        basarisiz(f"Arama başarısız {sure_yaz(ms1)}")
        return

    sonuclar = sorted(resp.json()["results"], key=lambda r: r["similarity"], reverse=True)
    beklenen_id = f"{RECORD_ID_PREFIX}{beklenen_girdi_key}"
    top1 = sonuclar[0] if sonuclar else None

    if top1 is not None and top1["record_id"] == beklenen_id:
        uyum = top1["similarity"] * 100
        basarili(f"{beklenen_tesis['ad']} — %{uyum:.1f} uyum ({etiket}) {sure_yaz(ms1)}")
    else:
        bulunan = top1["record_id"] if top1 else "sonuç yok"
        basarisiz(f"Beklenen eşleşme bulunamadı (üst sonuç: {bulunan}) {sure_yaz(ms1)}")


def adim4_metal_eslestirme() -> None:
    eslestirme_adimi(4, *ESLESTIRME_SENARYOLARI[0])


def adim5_plastik_eslestirme() -> None:
    eslestirme_adimi(5, *ESLESTIRME_SENARYOLARI[1])


def adim6_organik_eslestirme() -> None:
    eslestirme_adimi(6, *ESLESTIRME_SENARYOLARI[2])


# --- ADIM 7: Çapraz kontrol ---------------------------------------------------

def adim7_capraz_kontrol() -> None:
    bekle("ADIM 7/7: Çapraz kontrol — Metal çıktı ↔ organik girdi eşleşmeli mi?")
    cikti_tesis = OSB1_TESISLER["a_metal"]
    hedef_id = f"{RECORD_ID_PREFIX}f_organik"

    metin = enrich_text(cikti_tesis["cikti"])
    resp, ms = olc(istek, "POST", "/search", json={
        "text": metin, "record_type": "input", "threshold": 0.0, "limit": 20,
    })
    if resp is None or resp.status_code != 200:
        basarisiz(f"Arama başarısız {sure_yaz(ms)}")
        return

    sonuclar = resp.json()["results"]
    hedef_kayit = next((r for r in sonuclar if r["record_id"] == hedef_id), None)

    if hedef_kayit is None:
        basarisiz(f"Eşleşme yok — farklı kategori (biyogaz tesisi hiç dönmedi) {sure_yaz(ms)}")
    else:
        skor = hedef_kayit["similarity"]
        if skor < 0.40:
            basarisiz(f"Eşleşme yok — farklı kategori (skor={skor:.4f}, düşük) {sure_yaz(ms)}")
        else:
            basarili(f"Beklenmedik şekilde eşleşti (skor={skor:.4f}) {sure_yaz(ms)}")


# --- Temizlik ------------------------------------------------------------------

def temizlik() -> None:
    baslik("TEMİZLİK: Demo Verilerini pgvector'dan Sil")
    if not kayitli_id_ler:
        print("  Silinecek kayıt yok.")
        return
    for record_id in kayitli_id_ler:
        try:
            vector_store.delete(record_id)
            print(f"  Silindi: {record_id}")
        except Exception as exc:
            basarisiz(f"Silme hatası ({record_id}): {exc}")


# --- Ana akış --------------------------------------------------------------

def main() -> None:
    print(f"{BOLD}{CYAN}DöngüNet AI — MVP Canlı Demo{RESET}")
    print(f"Hedef: {BASE_URL}")
    print("Senaryo: İki OSB'deki 6 tesisin malzeme eşleştirmesi")
    print(f"  {GRI}OSB-1 (Gebze):  A) Metal işleme  B) Plastik enjeksiyon  C) Gıda üretim{RESET}")
    print(f"  {GRI}OSB-2 (Kocaeli): D) Çelik döküm   E) Plastik geri dönüşüm  F) Biyogaz{RESET}")

    if not servis_ayakta_mi():
        basarisiz(f"Servise ulaşılamıyor ({BASE_URL})")
        print("Servis çalışmıyor olabilir. Önce başlatın, ör.:")
        print("  uvicorn app.main:app --host 127.0.0.1 --port 8000")
        sys.exit(1)

    try:
        vector_store.connect()
    except Exception as exc:
        basarisiz(f"pgvector bağlantı hatası: {exc}")
        sys.exit(1)

    try:
        adim1_siniflandir()
        adim2_ciktilari_kaydet()
        adim3_girdileri_kaydet()
        adim4_metal_eslestirme()
        adim5_plastik_eslestirme()
        adim6_organik_eslestirme()
        adim7_capraz_kontrol()
    finally:
        temizlik()

    baslik("DEMO TAMAMLANDI")
    print(f"{YESIL}DöngüNet AI, farklı OSB'lerdeki tesisler arasında malzeme akışını "
          f"anlamsal olarak eşleştirebiliyor.{RESET}")


if __name__ == "__main__":
    main()

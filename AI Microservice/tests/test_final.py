"""DöngüNet AI — Final Kontrol Testi (MVP Onayı).

6 endpoint'i tek seferde test eder ve sonuç tablosunu basar. Servisin
localhost:8000'de çalışıyor olması gerekir.

ÇALIŞTIRMA: Önce servisi başlatın (ör. `uvicorn app.main:app`), sonra:
    python tests/test_final.py
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

# tests/ içinden çalıştırıldığında proje kökünü sys.path'e ekle.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30
SAGLIK_TIMEOUT = 3


def istek(method: str, path: str, **kwargs):
    """HTTP isteği at. Bağlantı hatasında None döndür."""
    url = f"{BASE_URL}{path}"
    try:
        return requests.request(method, url, timeout=TIMEOUT, **kwargs)
    except requests.exceptions.RequestException as exc:
        print(f"  ! HTTP hatası ({method} {path}): {exc}")
        return None


def servis_ayakta_mi() -> bool:
    try:
        requests.get(f"{BASE_URL}/health", timeout=SAGLIK_TIMEOUT)
        return True
    except requests.exceptions.RequestException:
        return False


# --- Her endpoint için: (isim, method, path, payload, doğrulama_fonksiyonu) --

def kontrol_health(resp: requests.Response) -> bool:
    data = resp.json()
    return (
        data.get("model_loaded") is True
        and data.get("db_connected") is True
        and data.get("classifier_ready") is True
    )


def kontrol_embed(resp: requests.Response) -> bool:
    data = resp.json()
    return data.get("dim") == 768


def kontrol_embed_passport(resp: requests.Response) -> bool:
    data = resp.json()
    return bool(data.get("built_text"))


def kontrol_classify(resp: requests.Response) -> bool:
    data = resp.json()
    return data.get("category") == "METAL"


def kontrol_search(resp: requests.Response) -> bool:
    data = resp.json()
    return isinstance(data.get("results"), list)


def kontrol_reload_prototypes(resp: requests.Response) -> bool:
    data = resp.json()
    return data.get("status") == "ok"


TESTLER = [
    ("/health", "GET", "/health", None, kontrol_health),
    ("/embed", "POST", "/embed", {"text": "test"}, kontrol_embed),
    ("/embed/passport", "POST", "/embed/passport", {"material_class": "çelik"}, kontrol_embed_passport),
    ("/classify", "POST", "/classify", {"text": "çelik talaşı"}, kontrol_classify),
    ("/search", "POST", "/search", {"text": "metal hurda"}, kontrol_search),
    ("/reload-prototypes", "POST", "/reload-prototypes",
     {"category": "METAL", "examples": ["test örneği"]}, kontrol_reload_prototypes),
]


# --- Tablo çizimi (unicode kutu çizgileri) ------------------------------------

def tablo_yazdir(sonuclar: list[tuple[str, bool, float]]) -> None:
    basliklar = ["Endpoint", "Status", "Süre(ms)"]
    genislikler = [
        max(len(basliklar[0]), max(len(isim) for isim, _, _ in sonuclar)) + 2,
        max(len(basliklar[1]), len("✓")) + 2,
        max(len(basliklar[2]), max(len(f"{ms:.0f}") for _, _, ms in sonuclar)) + 2,
    ]

    def cizgi(sol: str, orta: str, sag: str) -> str:
        return sol + orta.join("─" * w for w in genislikler) + sag

    def satir(hucreler: list[str]) -> str:
        return "│" + "│".join(f" {h:<{w - 2}} " for h, w in zip(hucreler, genislikler)) + "│"

    print(cizgi("┌", "┬", "┐"))
    print(satir(basliklar))
    print(cizgi("├", "┼", "┤"))
    for isim, basarili, ms in sonuclar:
        sembol = "✓" if basarili else "✗"
        print(satir([isim, sembol, f"{ms:.0f}"]))
    print(cizgi("└", "┴", "┘"))


# --- Ana akış ------------------------------------------------------------

def main() -> None:
    print("DöngüNet AI — Final Kontrol Testi")
    print(f"Hedef: {BASE_URL}\n")

    if not servis_ayakta_mi():
        print(f"═══ HATA: Servise ulaşılamıyor ({BASE_URL}) ═══")
        print("Servis çalışmıyor olabilir. Önce başlatın, ör.:")
        print("  uvicorn app.main:app --host 127.0.0.1 --port 8000")
        sys.exit(1)

    sonuclar: list[tuple[str, bool, float]] = []
    for isim, method, path, payload, dogrula in TESTLER:
        t0 = time.time()
        resp = istek(method, path, json=payload) if payload is not None else istek(method, path)
        ms = (time.time() - t0) * 1000

        if resp is None or resp.status_code != 200:
            sonuclar.append((isim, False, ms))
            continue

        try:
            basarili = dogrula(resp)
        except Exception as exc:
            print(f"  ! {isim} doğrulama hatası: {exc}")
            basarili = False
        sonuclar.append((isim, basarili, ms))

    print()
    tablo_yazdir(sonuclar)

    gecen = sum(1 for _, b, _ in sonuclar if b)
    toplam = len(sonuclar)
    print(f"\n{gecen}/{toplam} {'✓' if gecen == toplam else '✗'} → "
          f"{'MVP HAZIR ✅' if gecen == toplam else 'MVP HAZIR DEĞİL ❌'}")

    if gecen != toplam:
        sys.exit(1)


if __name__ == "__main__":
    main()

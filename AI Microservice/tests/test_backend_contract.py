"""Backend sözleşme testi — servis çalışmadan, statik olarak doğrular.

Ne kontrol eder: `backend/src/modules/ai/ai-client.service.ts` şu iki
varsayımla yazıldı (kod içindeki yorumlarda açıkça belirtilir):

  1. `/classify` her zaman AI_CATEGORY_TO_MATERIAL_CLASS'taki 7 anahtardan
     birini döner (METAL, PLASTIK, ORGANIK, KIMYASAL, TEKSTIL, CAM, KAGIT).
     Yeni bir kategori eklenir/adı değişirse backend'in adaptörü bunu
     sessizce `.toLowerCase()` ile geçiştirir — bu test o kaymayı
     `python tests/test_backend_contract.py` çalıştırıldığı an yakalar.
  2. `/embed` ve `/classify` yanıt şemaları backend'in TypeScript
     arayüzleriyle (AiEmbedResponse: {vector, dim}, AiClassifyResponse:
     {category, confidence, all_scores}) birebir eşleşir — docs/07'nin
     iddia ettiği ama gerçek serviste OLMAYAN alanlar (`model`, `normalized`,
     `top3`, `requires_human_review`) burada da yok, backend zaten
     bunları kendisi hesaplıyor/sabitliyor.

ÇALIŞTIRMA: python tests/test_backend_contract.py
(Servis ayakta olmasına gerek yok — saf statik/şema kontrolü.)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

from app.classifier import CATEGORY_EXAMPLES  # noqa: E402
from app.schemas import ClassifyResponse, EmbedResponse  # noqa: E402

# backend/src/modules/ai/ai-client.service.ts — AI_CATEGORY_TO_MATERIAL_CLASS
BACKEND_BEKLENEN_KATEGORILER = {
    "METAL", "PLASTIK", "ORGANIK", "KIMYASAL", "TEKSTIL", "CAM", "KAGIT",
}

# backend/src/modules/ai/ai-client.service.ts — AiEmbedResponse / AiClassifyResponse
BACKEND_BEKLENEN_EMBED_ALANLARI = {"vector", "dim"}
BACKEND_BEKLENEN_CLASSIFY_ALANLARI = {"category", "confidence", "all_scores"}


def kontrol_kategoriler() -> tuple[bool, str]:
    gercek = set(CATEGORY_EXAMPLES.keys())
    if gercek != BACKEND_BEKLENEN_KATEGORILER:
        eksik = BACKEND_BEKLENEN_KATEGORILER - gercek
        fazla = gercek - BACKEND_BEKLENEN_KATEGORILER
        return False, (
            f"CATEGORY_EXAMPLES ({sorted(gercek)}) backend'in beklediği "
            f"{sorted(BACKEND_BEKLENEN_KATEGORILER)} ile uyuşmuyor "
            f"(eksik={sorted(eksik)}, fazla={sorted(fazla)}). "
            "ai-client.service.ts'teki AI_CATEGORY_TO_MATERIAL_CLASS'ı güncelle."
        )
    return True, f"{len(gercek)} kategori birebir eşleşiyor"


def kontrol_embed_semasi() -> tuple[bool, str]:
    alanlar = set(EmbedResponse.model_fields.keys())
    if alanlar != BACKEND_BEKLENEN_EMBED_ALANLARI:
        return False, (
            f"EmbedResponse alanları {sorted(alanlar)}, backend'in beklediği "
            f"{sorted(BACKEND_BEKLENEN_EMBED_ALANLARI)} ile uyuşmuyor."
        )
    return True, f"alanlar birebir: {sorted(alanlar)}"


def kontrol_classify_semasi() -> tuple[bool, str]:
    alanlar = set(ClassifyResponse.model_fields.keys())
    if alanlar != BACKEND_BEKLENEN_CLASSIFY_ALANLARI:
        return False, (
            f"ClassifyResponse alanları {sorted(alanlar)}, backend'in beklediği "
            f"{sorted(BACKEND_BEKLENEN_CLASSIFY_ALANLARI)} ile uyuşmuyor."
        )
    return True, f"alanlar birebir: {sorted(alanlar)}"


def main() -> None:
    print("Backend Sözleşme Testi (statik şema kontrolü)\n")

    testler = [
        ("Kategori seti (7 Türkçe, büyük harf)", kontrol_kategoriler),
        ("/embed yanıt şeması", kontrol_embed_semasi),
        ("/classify yanıt şeması", kontrol_classify_semasi),
    ]

    hepsi_basarili = True
    for isim, fn in testler:
        basarili, detay = fn()
        sembol = "✓" if basarili else "✗"
        print(f"  {sembol} {isim}: {detay}")
        hepsi_basarili = hepsi_basarili and basarili

    print()
    if hepsi_basarili:
        print("✓ Backend sözleşmesiyle uyumlu.")
    else:
        print("✗ UYUŞMAZLIK — ai-client.service.ts adaptörünü ve/veya docs/07'yi güncelle.")
        sys.exit(1)


if __name__ == "__main__":
    main()

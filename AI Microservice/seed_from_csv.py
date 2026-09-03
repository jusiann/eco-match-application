"""veri.csv Bölüm 1'i (ilk 140 satır) category_examples tablosuna aktarır.

Bölüm 1 formatı: id,kategori,tanim,tip (satır 1-141, başlık dahil).
Kategori adları DB'deki ASCII biçimine normalize edilir (PLASTİK -> PLASTIK,
KİMYASAL -> KIMYASAL, KAĞIT -> KAGIT, TEKSTİL -> TEKSTIL) çünkü classifier.py
içindeki CATEGORY_EXAMPLES sözlüğü ve mevcut DB kayıtları bu biçimi kullanıyor.
"""
import csv
import logging

import psycopg2

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

DB_CONFIG = dict(
    host="localhost",
    port=5433,
    dbname="ecomatch",
    user="ecomatch",
    password="1Eco2Meko3Seko",
)

CSV_PATH = "veri.csv"
SECTION_HEADER = "id,kategori,tanim,tip"
SOURCE = "csv_import"

TR_UPPER_MAP = str.maketrans({
    "İ": "I",
    "I": "I",
    "Ğ": "G",
    "Ü": "U",
    "Ş": "S",
    "Ö": "O",
    "Ç": "C",
})


def normalize_category(kategori: str) -> str:
    return kategori.strip().upper().translate(TR_UPPER_MAP)


def read_section_1(path: str) -> list[tuple[str, str]]:
    """CSV'den Bölüm 1'i okur: ilk 'id,kategori,tanim,tip' başlığından
    bir sonraki 'id' başlığına (veya dosya sonuna) kadar."""
    rows: list[tuple[str, str]] = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        lines = f.readlines()

    start = None
    for i, line in enumerate(lines):
        if line.strip() == SECTION_HEADER:
            start = i
            break
    if start is None:
        raise ValueError(f"Bölüm 1 başlığı bulunamadı: {SECTION_HEADER!r}")

    end = len(lines)
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("id,"):
            end = i
            break

    section_lines = lines[start:end]
    reader = csv.DictReader(section_lines)
    for row in reader:
        kategori = normalize_category(row["kategori"])
        tanim = row["tanim"].strip()
        if kategori and tanim:
            rows.append((kategori, tanim))
    return rows


def seed() -> None:
    rows = read_section_1(CSV_PATH)
    logger.info("veri.csv Bölüm 1'den %d satır okundu.", len(rows))

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    inserted_by_category: dict[str, int] = {}
    total_inserted = 0

    try:
        with conn.cursor() as cur:
            for kategori, tanim in rows:
                cur.execute(
                    """
                    INSERT INTO category_examples (category, example, source, active)
                    VALUES (%s, %s, %s, TRUE)
                    ON CONFLICT (category, example) DO NOTHING
                    """,
                    (kategori, tanim, SOURCE),
                )
                if cur.rowcount == 1:
                    total_inserted += 1
                    inserted_by_category[kategori] = inserted_by_category.get(kategori, 0) + 1

            cur.execute("SELECT COUNT(*) FROM category_examples")
            toplam_db = cur.fetchone()[0]
    finally:
        conn.close()

    logger.info("=" * 50)
    logger.info("Toplam eklenen satır sayısı: %d", total_inserted)
    logger.info("-" * 50)
    logger.info("Kategori bazında eklenen sayılar:")
    for kategori in sorted(inserted_by_category):
        logger.info("  %-12s %d", kategori, inserted_by_category[kategori])
    logger.info("-" * 50)
    logger.info("DB'deki toplam örnek sayısı (eski + yeni): %d", toplam_db)
    logger.info("=" * 50)


if __name__ == "__main__":
    seed()

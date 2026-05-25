import json
import re
from pathlib import Path

from database import SessionLocal
from models import Chapter


PROJECT_ROOT = Path(__file__).resolve().parent.parent
BOOKS_DIR = PROJECT_ROOT / "data" / "books"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def extract_chapter_number(chapter, fallback):
    title = chapter.get("title", "")

    match = re.search(r"\d+", title)
    if match:
        return int(match.group())

    return fallback


def get_audio_url(chapter):
    return (
        chapter.get("audio")
        or chapter.get("audio_url")
        or chapter.get("audioUrl")
        or ""
    ).strip()


def sync_audio():
    db = SessionLocal()

    updated = 0
    skipped = 0
    missing = 0
    errors = 0

    try:
        files = sorted(BOOKS_DIR.rglob("book-*.json"))

        print(f"🔎 Tìm thấy {len(files)} file book JSON")

        for file_path in files:
            try:
                book_data = load_json(file_path)
                book_id = int(book_data.get("id", 0))

                if not book_id:
                    skipped += 1
                    continue

                chapters = book_data.get("chapters", [])

                if not isinstance(chapters, list):
                    skipped += 1
                    continue

                for index, chapter_data in enumerate(chapters, start=1):
                    audio_url = get_audio_url(chapter_data)

                    if not audio_url:
                        skipped += 1
                        continue

                    chapter_number = extract_chapter_number(chapter_data, index)

                    chapter = db.query(Chapter).filter(
                        Chapter.book_id == book_id,
                        Chapter.chapter_number == chapter_number
                    ).first()

                    if not chapter:
                        missing += 1
                        continue

                    if chapter.audio_url == audio_url:
                        skipped += 1
                        continue

                    chapter.audio_url = audio_url
                    updated += 1

                db.commit()

            except Exception as e:
                db.rollback()
                errors += 1
                print(f"❌ Lỗi file {file_path}: {e}")

        print("\n=== HOÀN TẤT SYNC AUDIO ===")
        print(f"✔ Updated: {updated}")
        print(f"➖ Skipped: {skipped}")
        print(f"⚠ Missing chapters: {missing}")
        print(f"✘ Errors: {errors}")

    finally:
        db.close()


if __name__ == "__main__":
    sync_audio()
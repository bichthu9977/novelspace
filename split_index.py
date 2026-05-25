import json
import math
import os

print("📚 Splitting books-index-seo.json into chunks...")

# Load original file
with open('books-index-seo.json', 'r', encoding='utf-8') as f:
    books = json.load(f)

print(f"Total books: {len(books)}")

# Split into 10 chunks
num_chunks = 10
chunk_size = math.ceil(len(books) / num_chunks)

print(f"Chunk size: {chunk_size} books")
print()

for i in range(num_chunks):
    start = i * chunk_size
    end = min((i + 1) * chunk_size, len(books))

    chunk = books[start:end]
    filename = f'books-index-{i+1}.json'

    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(chunk, f, ensure_ascii=False, indent=2)

    file_size = os.path.getsize(filename) / (1024 * 1024)  # MB
    print(f"✅ {filename}: {len(chunk)} books (~{file_size:.1f}MB)")

print()
print("=" * 50)
print("✅ Done! Created 10 chunk files")
print("=" * 50)
print()
print("⚠️  NOTE: You can now delete books-index-seo.json")
print("   (kept for reference only)")

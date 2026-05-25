#!/usr/bin/env bash
#
# migrate-domain.sh — Đổi domain và brand cho toàn bộ project
#
#   truyenfullvn.org  →  truyenfullvn.org
#   TRUYENFULLVN       →  TRUYENFULLVN     (all caps - logo/heading)
#   TruyenFullvn       →  TruyenFullvn     (CamelCase - text)
#
# Cách dùng:
#   1. Đặt file này vào root của repo (cùng cấp với index.html)
#   2. Mở terminal, cd vào folder repo
#   3. Chạy: bash migrate-domain.sh
#   4. Sau khi script chạy xong, review diff và commit thủ công
#
# Yêu cầu: bash, sed, grep, find, xargs, git (chỉ để backup branch)
# Hỗ trợ: macOS, Linux
# Không sửa file nếu repo có uncommitted changes (trừ khi confirm)
#

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────
# Cấu hình
# ──────────────────────────────────────────────────────────────────────

OLD_DOMAIN='truyenfullvn\.com'
NEW_DOMAIN='truyenfullvn.org'

OLD_BRAND_UPPER='TRUYENFULLVN'
NEW_BRAND_UPPER='TRUYENFULLVN'

OLD_BRAND_CAMEL='TruyenFullvn'
NEW_BRAND_CAMEL='TruyenFullvn'

# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

# Cross-platform sed in-place: macOS cần đối số `''`, Linux thì không
if [[ "$(uname)" == "Darwin" ]]; then
    sed_inplace() { sed -i '' "$@"; }
else
    sed_inplace() { sed -i "$@"; }
fi

# Phát hiện số CPU cores cho parallel processing
detect_cores() {
    if command -v nproc >/dev/null 2>&1; then
        nproc
    elif [[ "$(uname)" == "Darwin" ]]; then
        sysctl -n hw.ncpu
    else
        echo 4
    fi
}

# Áp dụng tất cả 3 replacements vào 1 file (gộp lại để nhanh hơn)
apply_all() {
    local file="$1"
    sed_inplace \
        -e "s|${OLD_DOMAIN}|${NEW_DOMAIN}|g" \
        -e "s|${OLD_BRAND_UPPER}|${NEW_BRAND_UPPER}|g" \
        -e "s|${OLD_BRAND_CAMEL}|${NEW_BRAND_CAMEL}|g" \
        "$file"
}
export -f sed_inplace apply_all
export OLD_DOMAIN NEW_DOMAIN OLD_BRAND_UPPER NEW_BRAND_UPPER OLD_BRAND_CAMEL NEW_BRAND_CAMEL

section() {
    echo ""
    echo "════════════════════════════════════════════════"
    echo "  $1"
    echo "════════════════════════════════════════════════"
}

# ──────────────────────────────────────────────────────────────────────
# 0. Pre-flight checks
# ──────────────────────────────────────────────────────────────────────

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

section "Domain & Brand Migration"
echo ""
echo "  Repo:        $REPO_DIR"
echo "  Domain:      truyenfullvn.org  →  truyenfullvn.org"
echo "  Brand:       TruyenFullvn       →  TruyenFullvn"
echo "  Brand (caps): TRUYENFULLVN       →  TRUYENFULLVN"
echo ""

if [[ ! -d ".git" ]]; then
    echo "ERROR: Đây không phải git repo. Chạy script trong root của repo."
    exit 1
fi

if [[ ! -f "index.html" ]]; then
    echo "ERROR: Không tìm thấy index.html ở thư mục hiện tại."
    echo "       Đảm bảo script được đặt trong root của repo."
    exit 1
fi

# Kiểm tra uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "CẢNH BÁO: Repo đang có uncommitted changes."
    read -p "          Tiếp tục? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Đã hủy. Hãy commit hoặc stash changes trước rồi chạy lại."
        exit 0
    fi
fi

# ──────────────────────────────────────────────────────────────────────
# 1. Tạo backup branch
# ──────────────────────────────────────────────────────────────────────

BACKUP_BRANCH="backup-pre-domain-$(date +%Y%m%d-%H%M%S)"
section "Tạo backup branch: $BACKUP_BRANCH"
git branch "$BACKUP_BRANCH"
echo "  ✓ Backup tạo xong"
echo "  Để rollback sau này: git reset --hard $BACKUP_BRANCH"

# ──────────────────────────────────────────────────────────────────────
# 2. Liệt kê file cần sửa (loại trừ folder không liên quan)
# ──────────────────────────────────────────────────────────────────────

section "STEP 1/3: Cập nhật code & config files ở root"

# Files ở root + subfolders nhỏ (không bao gồm truyen/, data/, .git/, etc)
ROOT_FILES=$(find . \
    \( -name "*.html" -o -name "*.js" -o -name "*.py" -o -name "*.json" \
       -o -name "*.xml" -o -name "*.txt" -o -name "*.css" -o -name "CNAME" \) \
    -not -path "./.git/*" \
    -not -path "./.truyen-old/*" \
    -not -path "./.venv/*" \
    -not -path "./__pycache__/*" \
    -not -path "./truyen/*" \
    -not -path "./data/*" \
    -not -path "./images/*" \
    -not -name "migrate-domain.sh" \
    -type f 2>/dev/null)

NUM_ROOT=$(echo "$ROOT_FILES" | grep -c . || echo 0)
echo "  Tìm thấy $NUM_ROOT files ở root/subfolders nhỏ"

if [[ "$NUM_ROOT" -gt 0 ]]; then
    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        apply_all "$file"
    done <<< "$ROOT_FILES"
    echo "  ✓ Đã cập nhật $NUM_ROOT files"
fi

# ──────────────────────────────────────────────────────────────────────
# 3. Cập nhật sitemap.xml (file lớn riêng biệt)
# ──────────────────────────────────────────────────────────────────────

section "STEP 2/3: Cập nhật sitemap.xml"

if [[ -f "sitemap.xml" ]]; then
    SITEMAP_SIZE=$(wc -l < sitemap.xml | tr -d ' ')
    echo "  sitemap.xml: $SITEMAP_SIZE dòng"
    apply_all "sitemap.xml"
    echo "  ✓ Đã cập nhật"
else
    echo "  (sitemap.xml không tồn tại, bỏ qua)"
fi

# ──────────────────────────────────────────────────────────────────────
# 4. Parallel update toàn bộ HTML trong truyen/
# ──────────────────────────────────────────────────────────────────────

section "STEP 3/3: Cập nhật HTML files trong truyen/ (parallel)"

if [[ -d "truyen" ]]; then
    NUM_TRUYEN=$(find truyen -name "index.html" -type f 2>/dev/null | wc -l | tr -d ' ')
    NUM_CORES=$(detect_cores)
    echo "  $NUM_TRUYEN HTML files trong truyen/"
    echo "  Dùng $NUM_CORES processes song song"
    echo "  Đang xử lý... (có thể mất 30-90 giây)"

    find truyen -name "index.html" -type f -print0 | \
        xargs -0 -P "$NUM_CORES" -I{} bash -c 'apply_all "$@"' _ {}

    echo "  ✓ Đã cập nhật $NUM_TRUYEN files"
else
    echo "  (folder truyen/ không tồn tại, bỏ qua)"
fi

# ──────────────────────────────────────────────────────────────────────
# 5. Verification
# ──────────────────────────────────────────────────────────────────────

section "VERIFICATION"

count_matches() {
    local pattern="$1"
    grep -rl "$pattern" \
        --include="*.html" --include="*.js" --include="*.py" \
        --include="*.xml" --include="*.txt" --include="*.json" \
        --include="*.css" --include="CNAME" \
        --exclude-dir=.git --exclude-dir=.truyen-old \
        --exclude-dir=.venv --exclude-dir=__pycache__ \
        . 2>/dev/null | wc -l | tr -d ' '
}

REMAINING_DOMAIN=$(count_matches "truyenfullvn")
REMAINING_BRAND=$(count_matches "TruyenFullvn\|TRUYENFULLVN")
NEW_DOMAIN_COUNT=$(count_matches "truyenfullvn.org")
NEW_BRAND_COUNT=$(count_matches "TruyenFullvn\|TRUYENFULLVN")

echo ""
echo "  Còn lại (cần = 0):"
echo "    - truyenfullvn:  $REMAINING_DOMAIN files"
echo "    - TruyenFullvn/TRUYENFULLVN: $REMAINING_BRAND files"
echo ""
echo "  Đã thay (cần > 0):"
echo "    - truyenfullvn.org: $NEW_DOMAIN_COUNT files"
echo "    - TruyenFullvn/TRUYENFULLVN: $NEW_BRAND_COUNT files"
echo ""

if [[ "$REMAINING_DOMAIN" -eq 0 && "$REMAINING_BRAND" -eq 0 ]]; then
    echo "  ✓ SUCCESS: Tất cả references đã được thay thế"
else
    echo "  ⚠ WARNING: Còn references chưa thay. Files cần review:"
    grep -rl "truyenfullvn\|TruyenFullvn\|TRUYENFULLVN" \
        --include="*.html" --include="*.js" --include="*.py" \
        --include="*.xml" --include="*.txt" --include="*.json" \
        --include="CNAME" \
        --exclude-dir=.git --exclude-dir=.truyen-old \
        --exclude-dir=.venv --exclude-dir=__pycache__ \
        . 2>/dev/null | head -10 | sed 's/^/    /'
fi

# ──────────────────────────────────────────────────────────────────────
# 6. Next steps
# ──────────────────────────────────────────────────────────────────────

section "NEXT STEPS"
echo ""
echo "  1. Xem diff tổng quát:"
echo "       git diff --stat | tail -20"
echo ""
echo "  2. Test website thủ công:"
echo "       open index.html        # macOS"
echo "       xdg-open index.html    # Linux"
echo "     (Kiểm tra: trang chủ load OK, meta tags đúng domain mới,"
echo "      mở 1 book trong truyen/, check link và brand đã đổi)"
echo ""
echo "  3. Commit và push:"
echo "       git add -A"
echo "       git commit -m 'Migrate to truyenfullvn.org / TruyenFullvn brand'"
echo "       git push origin main"
echo ""
echo "  4. Rollback nếu có lỗi:"
echo "       git reset --hard $BACKUP_BRANCH"
echo ""
echo "  5. Operational (ngoài code):"
echo "       - Trỏ DNS của truyenfullvn.org về hosting"
echo "       - GitHub Pages → Settings → Custom domain → truyenfullvn.org"
echo "       - Google Search Console: thêm property mới + Change of Address"
echo "       - Setup 301 redirect từ truyenfullvn.org → truyenfullvn.org"
echo ""
section "DONE"

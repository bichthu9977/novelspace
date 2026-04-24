let books = [];

let activeChip = "all";
let currentBook = null;
let currentChapterIndex = 0;
let currentPage = 1;
let showShelfOnly = false;

let lastScrollY = 0;
let mobileTopbarTicking = false;

const booksPerPage = 6;

const STORAGE_KEYS = {
  theme: "readerTheme",
  fontSize: "readerFontSize",
  readerWidth: "readerWidth",
  shelf: "savedShelf",
  progress: "readingProgress",
  lastBookId: "lastReadBookId"
};

// DOM refs
let booksGrid;
let pagination;
let searchInput;
let searchBtn;
let sortSelect;
let authorFilter;
let chipGroup;
let homeView;
let readerView;
let readerTitle;
let readerMeta;
let readerBody;
let readerCover;
let readerAuthor;
let readerTags;
let readerDesc;
let chapterList;
let chapterSelect;
let backBtn;
let fontSizeRange;
let readerWidthRange;
let themeSelect;
let prevChapterBtn;
let nextChapterBtn;
let saveShelfBtn;
let scrollTopBtn;
let scrollBooksBtn;
let openFeaturedBtn;
let featuredCard;
let featuredCover;
let featuredTitle;
let featuredDesc;
let featuredBookId = null;
let homeBtn;
let homeLink;
let shelfLink;
let booksPanelTitle;
let rankingLink;
let categoryLink;
let mobileSearchToggle;
let mobileMenuToggle;
let searchWrap;
let mainNav;
let mobileRankingToggle;
let mobileCategoryToggle;
let mobileRankingMenu;
let mobileCategoryMenu;
let rankingList;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeParseJSON(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function isMobileView() {
  return window.innerWidth <= 640;
}

function isReaderOpen() {
  return !!(readerView && readerView.classList.contains("active"));
}

function isHomeOpen() {
  return !!(homeView && !homeView.classList.contains("hidden"));
}

function shouldUseMobileTopbarEffect() {
  return isMobileView() && (isReaderOpen() || isHomeOpen());
}

function closeMobilePanels() {
  document.body.classList.remove(
    "mobile-search-open",
    "mobile-menu-open",
    "mobile-ranking-open",
    "mobile-category-open"
  );
}

function closeMobileSubmenus() {
  document.body.classList.remove("mobile-ranking-open", "mobile-category-open");
}

function resetTopbarState() {
  document.body.classList.remove("reader-mobile", "topbar-hidden", "topbar-compact");
}

function getSearchSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7"></circle>
      <line x1="20" y1="20" x2="16.65" y2="16.65"></line>
    </svg>
  `;
}

function getMenuSvg() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="7" x2="20" y2="7"></line>
      <line x1="4" y1="12" x2="20" y2="12"></line>
      <line x1="4" y1="17" x2="20" y2="17"></line>
    </svg>
  `;
}

function applyMobileButtonIcons() {
  if (mobileSearchToggle) {
    mobileSearchToggle.innerHTML = getSearchSvg();
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.innerHTML = getMenuSvg();
  }
}

function updateMobileToggleState() {
  if (mobileSearchToggle) {
    const searchOpen = document.body.classList.contains("mobile-search-open");
    mobileSearchToggle.setAttribute("aria-expanded", String(searchOpen));
    mobileSearchToggle.setAttribute(
      "aria-label",
      searchOpen ? "Đóng tìm kiếm" : "Mở tìm kiếm"
    );
    mobileSearchToggle.classList.toggle("active", searchOpen);
  }

  if (mobileMenuToggle) {
    const menuOpen = document.body.classList.contains("mobile-menu-open");
    mobileMenuToggle.setAttribute("aria-expanded", String(menuOpen));
    mobileMenuToggle.setAttribute(
      "aria-label",
      menuOpen ? "Đóng menu" : "Mở menu"
    );
    mobileMenuToggle.classList.toggle("active", menuOpen);
  }
}

function toggleMobileSearch(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const willOpen = !document.body.classList.contains("mobile-search-open");

  document.body.classList.remove("mobile-menu-open");
  closeMobileSubmenus();
  document.body.classList.toggle("mobile-search-open", willOpen);
  document.body.classList.remove("topbar-hidden");
  document.body.classList.remove("topbar-compact");

  updateMobileToggleState();

  if (willOpen && searchInput) {
    setTimeout(() => searchInput.focus(), 80);
  }
}

function toggleMobileMenu(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const willOpen = !document.body.classList.contains("mobile-menu-open");

  document.body.classList.remove("mobile-search-open");

  if (!willOpen) {
    closeMobileSubmenus();
  }

  document.body.classList.toggle("mobile-menu-open", willOpen);
  document.body.classList.remove("topbar-hidden");
  document.body.classList.remove("topbar-compact");

  updateMobileToggleState();
}

function toggleMobileRanking(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const willOpen = !document.body.classList.contains("mobile-ranking-open");
  document.body.classList.remove("mobile-category-open");
  document.body.classList.toggle("mobile-ranking-open", willOpen);
}

function toggleMobileCategory(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const willOpen = !document.body.classList.contains("mobile-category-open");
  document.body.classList.remove("mobile-ranking-open");
  document.body.classList.toggle("mobile-category-open", willOpen);
}

function updateMobileTopbarOnScroll() {
  mobileTopbarTicking = false;

  if (!shouldUseMobileTopbarEffect()) {
    resetTopbarState();
    closeMobilePanels();
    updateMobileToggleState();
    return;
  }

  document.body.classList.add("reader-mobile");

  const panelOpen =
    document.body.classList.contains("mobile-search-open") ||
    document.body.classList.contains("mobile-menu-open");

  const currentScrollY = window.scrollY || window.pageYOffset || 0;
  const delta = currentScrollY - lastScrollY;

  if (panelOpen) {
    document.body.classList.remove("topbar-hidden");

    if (currentScrollY <= 80) {
      document.body.classList.remove("topbar-compact");
    } else {
      document.body.classList.add("topbar-compact");
    }

    lastScrollY = currentScrollY;
    return;
  }

  if (currentScrollY <= 10) {
    document.body.classList.remove("topbar-hidden", "topbar-compact");
  } else if (currentScrollY <= 80) {
    document.body.classList.add("topbar-compact");
    document.body.classList.remove("topbar-hidden");
  } else if (delta > 6) {
    document.body.classList.add("topbar-hidden");
    document.body.classList.add("topbar-compact");
  } else if (delta < -6) {
    document.body.classList.remove("topbar-hidden");

    if (currentScrollY <= 80) {
      document.body.classList.remove("topbar-compact");
    } else {
      document.body.classList.add("topbar-compact");
    }
  }

  lastScrollY = currentScrollY;
}

function handleMobileTopbarScroll() {
  if (!mobileTopbarTicking) {
    window.requestAnimationFrame(updateMobileTopbarOnScroll);
    mobileTopbarTicking = true;
  }
}

function normalizeBook(fullBook, fallback = {}) {
  const normalizedChapters = Array.isArray(fullBook?.chapters)
    ? fullBook.chapters.map((chapter, index) => ({
        title: chapter?.title || `Chương ${index + 1}`,
        content: Array.isArray(chapter?.content)
          ? chapter.content
              .map((p) => String(p ?? "").trim())
              .filter((p) => p !== "")
          : []
      }))
    : [];

  return {
    id: Number(fullBook?.id ?? fallback?.id ?? 0),
    title: fullBook?.title || fallback?.title || "Không có tên",
    author: fullBook?.author || fallback?.author || "Chưa rõ",
    tags: Array.isArray(fullBook?.tags)
      ? fullBook.tags
      : Array.isArray(fallback?.tags)
        ? fallback.tags
        : [],
    popularity: Number(fullBook?.popularity ?? fallback?.popularity ?? 0),
    desc: fullBook?.desc || fallback?.desc || "",
    cover: fullBook?.cover || fallback?.cover || "images/default.jpg",
    file: fullBook?.file || fallback?.file || "",
    chapterCount:
      normalizedChapters.length ||
      Number(fullBook?.chapterCount ?? fallback?.chapterCount ?? 0),
    chapters: normalizedChapters
  };
}

function getBookChapterCount(book) {
  const count = Number(
    book?.chapterCount || (Array.isArray(book?.chapters) ? book.chapters.length : 0)
  );
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function getSavedShelf() {
  const shelf = safeParseJSON(localStorage.getItem(STORAGE_KEYS.shelf), []);
  return Array.isArray(shelf) ? shelf.map(Number).filter(Number.isFinite) : [];
}

function setSavedShelf(shelf) {
  localStorage.setItem(STORAGE_KEYS.shelf, JSON.stringify(shelf));
}

function isBookSaved(bookId) {
  return getSavedShelf().includes(Number(bookId));
}

function saveToShelf(bookId) {
  const id = Number(bookId);
  const shelf = getSavedShelf();

  if (!shelf.includes(id)) {
    shelf.push(id);
    setSavedShelf(shelf);
  }
}

function removeFromShelf(bookId) {
  const id = Number(bookId);
  const shelf = getSavedShelf().filter((item) => item !== id);
  setSavedShelf(shelf);
}

function toggleShelf(bookId) {
  if (isBookSaved(bookId)) {
    removeFromShelf(bookId);
    return false;
  }

  saveToShelf(bookId);
  return true;
}

function getReadingProgressMap() {
  const progress = safeParseJSON(localStorage.getItem(STORAGE_KEYS.progress), {});
  return progress && typeof progress === "object" && !Array.isArray(progress) ? progress : {};
}

function setReadingProgressMap(progress) {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(progress));
}

function getReadingProgress(bookId) {
  const progress = getReadingProgressMap();
  const rawValue = progress[String(bookId)];
  const index = Number(rawValue);
  return Number.isFinite(index) && index >= 0 ? index : 0;
}

function saveReadingProgress() {
  if (!currentBook) return;

  const progress = getReadingProgressMap();
  progress[String(currentBook.id)] = currentChapterIndex;
  setReadingProgressMap(progress);

  localStorage.setItem(STORAGE_KEYS.lastBookId, String(currentBook.id));
}

function getProgressText(book) {
  const totalChapters = getBookChapterCount(book);
  if (!totalChapters) return "Chưa có chương";

  const savedIndex = getReadingProgress(book.id);
  const currentChapter = Math.min(savedIndex + 1, totalChapters);

  if (savedIndex <= 0) {
    return `Đang đọc: Chương 1/${totalChapters}`;
  }

  return `Đang đọc: Chương ${currentChapter}/${totalChapters}`;
}

function updateSaveShelfButton(bookId) {
  if (!saveShelfBtn) return;

  const saved = isBookSaved(bookId);
  saveShelfBtn.textContent = saved ? "♥ Đã lưu vào tủ sách" : "♡ Lưu truyện này";
  saveShelfBtn.classList.toggle("saved", saved);
}

function updateBooksPanelTitle() {
  if (booksPanelTitle) {
    booksPanelTitle.textContent = showShelfOnly ? "Tủ sách của bạn" : "Kho truyện nổi bật";
    return;
  }

  const fallbackTitle = document.querySelector(".section-title.section-title-main");
  if (fallbackTitle) {
    fallbackTitle.textContent = showShelfOnly ? "Tủ sách của bạn" : "Kho truyện nổi bật";
  }
}

function applyTheme(theme) {
  document.body.classList.remove("theme-dark", "theme-sepia");

  if (theme === "dark") {
    document.body.classList.add("theme-dark");
  } else if (theme === "sepia") {
    document.body.classList.add("theme-sepia");
  }

  if (themeSelect) {
    themeSelect.value = theme;
  }

  localStorage.setItem(STORAGE_KEYS.theme, theme);
}

function applySavedReaderSettings() {
  const savedFontSize = localStorage.getItem(STORAGE_KEYS.fontSize);
  const savedWidth = localStorage.getItem(STORAGE_KEYS.readerWidth);
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "paper";

  if (savedFontSize && readerBody && fontSizeRange) {
    fontSizeRange.value = savedFontSize;
    readerBody.style.fontSize = `${savedFontSize}px`;
  }

  if (savedWidth && readerWidthRange) {
    readerWidthRange.value = savedWidth;
    document.documentElement.style.setProperty("--reader-width", `${savedWidth}px`);
  }

  applyTheme(savedTheme);
}

function getAllCategoryTags() {
  const map = new Map();

  books.forEach((book) => {
    if (!Array.isArray(book.tags)) return;

    book.tags.forEach((rawTag) => {
      const tag = String(rawTag ?? "").trim();
      if (!tag) return;

      const key = tag.toLowerCase();
      if (!map.has(key)) {
        map.set(key, tag);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "vi"));
}

function renderCategoryControls() {
  const tags = getAllCategoryTags();
  const firstTags = tags.slice(0, 4);
  const restTags = tags.slice(4);
  const hasMore = restTags.length > 0;

  const makeChipButton = (tag, extra = false) => `
    <button
      class="chip-btn ${activeChip === tag ? "active" : ""} ${extra ? "category-extra" : ""}" ${extra ? "hidden" : ""}
      data-chip="${escapeHtml(tag)}"
      type="button"
    >${tag === "all" ? "Tất cả" : escapeHtml(tag)}</button>
  `;

  const makeMobileButton = (tag, extra = false) => `
    <button
      class="mobile-subitem ${activeChip === tag ? "active" : ""} ${extra ? "category-extra" : ""}" ${extra ? "hidden" : ""}
      type="button"
      data-mobile-chip="${escapeHtml(tag)}"
    >${tag === "all" ? "Tất cả" : escapeHtml(tag)}</button>
  `;

  const makeSidebarItem = (tag, extra = false) => `
    <li class="${extra ? "category-extra" : ""}" ${extra ? "hidden" : ""}>
      <a href="#" class="${activeChip === tag ? "active" : ""}" data-chip="${escapeHtml(tag)}">${tag === "all" ? "Tất cả" : escapeHtml(tag)}</a>
    </li>
  `;

  if (chipGroup) {
    chipGroup.innerHTML = `
      ${makeChipButton("all")}
      ${firstTags.map((tag) => makeChipButton(tag)).join("")}
      ${restTags.map((tag) => makeChipButton(tag, true)).join("")}
      ${hasMore ? '<button class="chip-btn category-toggle" type="button" data-category-toggle>Thêm thể loại ▾</button>' : ""}
    `;
  }

  const menuList = document.querySelector(".menu-list");
  if (menuList) {
    menuList.innerHTML = `
      ${makeSidebarItem("all")}
      ${firstTags.map((tag) => makeSidebarItem(tag)).join("")}
      ${restTags.map((tag) => makeSidebarItem(tag, true)).join("")}
      ${hasMore ? '<li><button class="category-sidebar-toggle" type="button" data-category-toggle>Thêm thể loại ▾</button></li>' : ""}
    `;
  }

  if (mobileCategoryMenu) {
    mobileCategoryMenu.innerHTML = `
      ${makeMobileButton("all")}
      ${firstTags.map((tag) => makeMobileButton(tag)).join("")}
      ${restTags.map((tag) => makeMobileButton(tag, true)).join("")}
      ${hasMore ? '<button class="mobile-subitem category-toggle" type="button" data-category-toggle>Thêm thể loại ▾</button>' : ""}
    `;
  }
}


function collapseCategoryExtrasByDefault() {
  document.querySelectorAll(".chip-group, .menu-list, .mobile-submenu").forEach((container) => {
    container.classList.remove("category-expanded");
    container.querySelectorAll(".category-extra").forEach((item) => {
      item.hidden = true;
    });
    const toggle = container.querySelector("[data-category-toggle]");
    if (toggle) {
      toggle.textContent = "Thêm thể loại ▾";
    }
  });
}

function toggleCategoryList(toggleButton) {
  const container = toggleButton.closest(".chip-group, .menu-list, .mobile-submenu");
  if (!container) return;

  const isOpen = container.classList.toggle("category-expanded");

  container.querySelectorAll(".category-extra").forEach((item) => {
    item.hidden = !isOpen;
  });

  toggleButton.textContent = isOpen ? "Thu gọn ▴" : "Thêm thể loại ▾";
}

function updateCategoryActiveState() {
  document.querySelectorAll("[data-chip]").forEach((el) => {
    el.classList.toggle("active", el.dataset.chip === activeChip);
  });

  document.querySelectorAll("[data-mobile-chip]").forEach((el) => {
    el.classList.toggle("active", el.dataset.mobileChip === activeChip);
  });
}

function getFilteredBooks() {
  let filtered = [...books];

  if (showShelfOnly) {
    const shelf = getSavedShelf();
    filtered = filtered.filter((book) => shelf.includes(Number(book.id)));
  }

  const keyword = searchInput?.value?.trim().toLowerCase() || "";
  const authorKeyword = authorFilter?.value?.trim().toLowerCase() || "";
  const sortValue = sortSelect?.value || "popular";

  if (keyword) {
    filtered = filtered.filter((book) => {
      const title = (book.title || "").toLowerCase();
      const author = (book.author || "").toLowerCase();
      const tags = Array.isArray(book.tags) ? book.tags.join(" ").toLowerCase() : "";
      const desc = (book.desc || "").toLowerCase();

      return (
        title.includes(keyword) ||
        author.includes(keyword) ||
        tags.includes(keyword) ||
        desc.includes(keyword)
      );
    });
  }

  if (authorKeyword) {
    filtered = filtered.filter((book) =>
      (book.author || "").toLowerCase().includes(authorKeyword)
    );
  }

  if (activeChip !== "all") {
    filtered = filtered.filter(
      (book) => Array.isArray(book.tags) && book.tags.includes(activeChip)
    );
  }

  if (sortValue === "title") {
    filtered.sort((a, b) => (a.title || "").localeCompare(b.title || "", "vi"));
  } else if (sortValue === "chapters") {
    filtered.sort((a, b) => getBookChapterCount(b) - getBookChapterCount(a));
  } else {
    filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  }

  return filtered;
}

function renderPagination(totalItems) {
  if (!pagination) return;

  const totalPages = Math.ceil(totalItems / booksPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  pagination.innerHTML = "";

  function addBtn(text, page, disabled = false, active = false) {
    const btn = document.createElement("button");
    btn.className = `page-btn ${active ? "active" : ""}`;
    btn.type = "button";
    btn.textContent = text;
    btn.disabled = disabled;

    btn.addEventListener("click", () => {
      if (disabled) return;
      currentPage = page;
      renderBooks();

      const booksSection = document.getElementById("booksSection");
      if (booksSection) {
        booksSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    pagination.appendChild(btn);
  }

  // << về trang đầu
  addBtn("<<", 1, currentPage === 1);

  // < trang trước
  addBtn("<", currentPage - 1, currentPage === 1);

  // chỉ hiện tối đa 4 trang gần currentPage
  let startPage = Math.max(1, currentPage - 1);
  let endPage = startPage + 3;

  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - 3);
  }

  for (let i = startPage; i <= endPage; i += 1) {
    addBtn(String(i), i, false, i === currentPage);
  }

  // > trang sau
  addBtn(">", currentPage + 1, currentPage === totalPages);

  // >> tới trang cuối
  addBtn(">>", totalPages, currentPage === totalPages);
}

function renderBooks() {
  if (!booksGrid) return;

  updateBooksPanelTitle();

  const filtered = getFilteredBooks();
  const start = (currentPage - 1) * booksPerPage;
  const pageItems = filtered.slice(start, start + booksPerPage);

  booksGrid.innerHTML = "";

  if (!filtered.length) {
    booksGrid.innerHTML = showShelfOnly
      ? '<div class="empty-state">Tủ sách của bạn đang trống. Hãy lưu vài truyện bạn thích nhé.</div>'
      : '<div class="empty-state">Không tìm thấy truyện phù hợp.</div>';

    if (pagination) pagination.innerHTML = "";
    return;
  }

  pageItems.forEach((book) => {
    const isSaved = isBookSaved(book.id);
    const saveText = isSaved ? "Đã lưu" : "Lưu";
    const continueIndex = getReadingProgress(book.id);
    const totalChapters = getBookChapterCount(book);
    const continueChapter = Math.min(continueIndex + 1, Math.max(totalChapters, 1));

    const card = document.createElement("div");
    card.className = "book-card";
    card.dataset.id = String(book.id);

    const tagsHtml = Array.isArray(book.tags)
      ? book.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")
      : "";

    const progressText = getProgressText(book);
    const showContinueBtn = totalChapters > 0;

    card.innerHTML = `
      <img
        class="book-thumb"
        src="${escapeHtml(book.cover || "images/default.jpg")}"
        alt="Bìa ${escapeHtml(book.title || "")}"
        loading="lazy"
        onerror="this.onerror=null;this.src='images/default.jpg'"
      />
      <div class="book-body">
        <div class="book-title">${escapeHtml(book.title || "Không có tên")}</div>
        <div class="book-meta">
          Tác giả: ${escapeHtml(book.author || "Chưa rõ")} • ${totalChapters} chương
        </div>
        <div class="tags">${tagsHtml}</div>
        <div class="book-desc">${escapeHtml(book.desc || "")}</div>
        <div class="reading-progress">${escapeHtml(progressText)}</div>
        <div class="book-actions">
          <button class="read-btn" type="button" data-id="${book.id}">Đọc ngay</button>
          ${
            showContinueBtn
              ? `<button class="continue-btn" type="button" data-continue="${book.id}">
                   Đọc tiếp ${continueChapter}
                 </button>`
              : ""
          }
          <button class="save-btn ${isSaved ? "saved" : ""}" type="button" data-save="${book.id}">
            ${saveText}
          </button>
        </div>
      </div>
    `;

    booksGrid.appendChild(card);
  });

  renderPagination(filtered.length);
}

function renderChapterChips() {
  if (!currentBook || !chapterList) return;

  const chapters = Array.isArray(currentBook.chapters) ? currentBook.chapters : [];
  chapterList.innerHTML = "";

  const chapter = chapters[currentChapterIndex];
  if (!chapter) return;

  const chip = document.createElement("span");
  chip.className = "chapter-chip active";
  chip.textContent = chapter.title || `Chương ${currentChapterIndex + 1}`;
  chapterList.appendChild(chip);
}

function renderChapterSelect() {
  if (!currentBook || !chapterSelect) return;

  const chapters = Array.isArray(currentBook.chapters) ? currentBook.chapters : [];
  chapterSelect.innerHTML = "";

  chapters.forEach((chapter, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = chapter?.title || `Chương ${index + 1}`;
    if (index === currentChapterIndex) option.selected = true;
    chapterSelect.appendChild(option);
  });
}

function clampChapterIndex(book, chapterIndex) {
  const total = Array.isArray(book?.chapters) ? book.chapters.length : 0;
  if (total <= 0) return 0;

  const idx = Number(chapterIndex);
  if (!Number.isFinite(idx) || idx < 0) return 0;
  if (idx >= total) return total - 1;
  return idx;
}

function renderEmptyReaderState(book) {
  if (readerMeta) {
    readerMeta.textContent = `${book.author || "Chưa rõ"} • Chưa có chương`;
  }

  if (readerBody) {
    readerBody.innerHTML = "<p>Truyện này hiện chưa có chương nào.</p>";
  }

  if (chapterList) {
    chapterList.innerHTML = "";
  }

  if (chapterSelect) {
    chapterSelect.innerHTML = "";
  }

  if (prevChapterBtn) prevChapterBtn.disabled = true;
  if (nextChapterBtn) nextChapterBtn.disabled = true;
}

function openChapter(chapterIndex) {
  if (!currentBook || !readerBody || !readerMeta) return;

  const chapters = Array.isArray(currentBook.chapters) ? currentBook.chapters : [];

  if (chapters.length === 0) {
    currentChapterIndex = 0;
    renderEmptyReaderState(currentBook);
    return;
  }

  currentChapterIndex = clampChapterIndex(currentBook, chapterIndex);
  const chapter = chapters[currentChapterIndex];

  if (!chapter || typeof chapter !== "object") {
    readerMeta.textContent = `${currentBook.author || "Chưa rõ"} • Chương không hợp lệ`;
    readerBody.innerHTML = "<p>Chương này bị lỗi dữ liệu.</p>";

    renderChapterChips();
    renderChapterSelect();

    if (prevChapterBtn) prevChapterBtn.disabled = currentChapterIndex === 0;
    if (nextChapterBtn) nextChapterBtn.disabled = currentChapterIndex >= chapters.length - 1;
    return;
  }

  const chapterTitle = chapter.title || `Chương ${currentChapterIndex + 1}`;
  readerMeta.textContent = `${currentBook.author || "Chưa rõ"} • ${chapterTitle}`;

  const contentArray = Array.isArray(chapter.content)
    ? chapter.content
        .map((p) => String(p ?? "").trim())
        .filter((p) => p !== "")
    : [];

  readerBody.innerHTML = contentArray.length
    ? contentArray.map((p) => `<p>${escapeHtml(p)}</p>`).join("")
    : "<p>Chương này chưa có nội dung.</p>";

  renderChapterChips();
  renderChapterSelect();

  if (prevChapterBtn) {
    prevChapterBtn.disabled = currentChapterIndex === 0;
  }

  if (nextChapterBtn) {
    nextChapterBtn.disabled = currentChapterIndex >= chapters.length - 1;
  }

  saveReadingProgress();
  lastScrollY = 0;
  window.scrollTo({ top: 0, behavior: "smooth" });
  handleMobileTopbarScroll();
}

async function openReader(bookId, chapterIndex = null) {
  const bookSummary = books.find((item) => Number(item.id) === Number(bookId));
  if (!bookSummary) return;

  try {
    const res = await fetch(bookSummary.file, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const fullBookData = await res.json();
    const fullBook = normalizeBook(fullBookData, bookSummary);
    currentBook = fullBook;

    if (readerTitle) {
      readerTitle.textContent = fullBook.title || "Không có tên";
    }

    if (readerCover) {
      readerCover.onerror = null;
      readerCover.src = fullBook.cover || "images/default.jpg";
      readerCover.alt = `Bìa ${fullBook.title || ""}`;
      readerCover.onerror = () => {
        readerCover.onerror = null;
        readerCover.src = "images/default.jpg";
      };
    }

    if (readerAuthor) {
      readerAuthor.textContent = `Tác giả: ${fullBook.author || "Chưa rõ"}`;
    }

    if (readerTags) {
      readerTags.innerHTML = Array.isArray(fullBook.tags)
        ? fullBook.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")
        : "";
    }

    if (readerDesc) {
      readerDesc.textContent = fullBook.desc || "";
    }

    updateSaveShelfButton(fullBook.id);

    if (homeView) {
      homeView.classList.add("hidden");
    }

    if (readerView) {
      readerView.classList.remove("hidden");
      readerView.classList.add("active");
    }

    closeMobilePanels();
    updateMobileToggleState();

    lastScrollY = 0;
    handleMobileTopbarScroll();

    const chapters = Array.isArray(fullBook.chapters) ? fullBook.chapters : [];
    if (chapters.length === 0) {
      currentChapterIndex = 0;
      renderEmptyReaderState(fullBook);
      return;
    }

    const finalChapterIndex =
      chapterIndex === null
        ? getReadingProgress(fullBook.id)
        : clampChapterIndex(fullBook, chapterIndex);

    currentChapterIndex = finalChapterIndex;
    openChapter(finalChapterIndex);
  } catch (error) {
    console.error("Không tải được file truyện:", error);
    alert("Không mở được truyện này.");
  }
}

function backHome() {
  if (readerView) {
    readerView.classList.remove("active");
    readerView.classList.add("hidden");
  }

  if (homeView) {
    homeView.classList.remove("hidden");
  }

  closeMobilePanels();
  updateMobileToggleState();
  resetTopbarState();
  window.scrollTo({ top: 0, behavior: "smooth" });
  lastScrollY = 0;
  handleMobileTopbarScroll();
}

function resetToHomeMode() {
  showShelfOnly = false;
  activeChip = "all";
  currentPage = 1;

  if (searchInput) searchInput.value = "";
  if (authorFilter) authorFilter.value = "";
  if (sortSelect) sortSelect.value = "popular";

  updateCategoryActiveState();
}

function goHome(e) {
  if (e) e.preventDefault();
  closeMobilePanels();
  updateMobileToggleState();
  resetToHomeMode();
  backHome();
  renderBooks();
}

function openCategorySection(e) {
  if (e) e.preventDefault();
  closeMobilePanels();
  updateMobileToggleState();

  if (readerView?.classList.contains("active")) {
    backHome();
  }

  const categorySection = $("categorySection");
  if (categorySection) {
    categorySection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openRankingSection(e) {
  if (e) e.preventDefault();
  closeMobilePanels();
  updateMobileToggleState();

  if (readerView?.classList.contains("active")) {
    backHome();
  }

  const rankingSection = $("rankingSection");
  if (rankingSection) {
    rankingSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openShelfView(e) {
  if (e) e.preventDefault();
  closeMobilePanels();
  updateMobileToggleState();

  showShelfOnly = true;
  currentPage = 1;

  if (readerView?.classList.contains("active")) {
    backHome();
  }

  renderBooks();

  const booksSection = $("booksSection");
  if (booksSection) {
    booksSection.scrollIntoView({ behavior: "smooth" });
  }
}

function setActiveChip(chip) {
  activeChip = chip;
  showShelfOnly = false;
  currentPage = 1;

  updateCategoryActiveState();

  renderBooks();
}


function pickRandomFeaturedBook() {
  if (!Array.isArray(books) || books.length === 0) return null;

  const validBooks = books.filter((book) => Number(book.id) && book.file);
  if (!validBooks.length) return null;

  const randomIndex = Math.floor(Math.random() * validBooks.length);
  return validBooks[randomIndex];
}

function renderFeaturedBook() {
  const featuredBook = pickRandomFeaturedBook();
  if (!featuredBook) return;

  featuredBookId = featuredBook.id;

  if (featuredCover) {
    featuredCover.onerror = null;
    featuredCover.src = featuredBook.cover || "images/default.jpg";
    featuredCover.alt = `Bìa ${featuredBook.title || "truyện đề cử"}`;
    featuredCover.onerror = () => {
      featuredCover.onerror = null;
      featuredCover.src = "images/default.jpg";
    };
  }

  if (featuredTitle) {
    featuredTitle.textContent = featuredBook.title || "Truyện đề cử hôm nay";
  }

  if (featuredDesc) {
    featuredDesc.textContent =
      featuredBook.desc ||
      (Array.isArray(featuredBook.tags) && featuredBook.tags.length
        ? `Thể loại: ${featuredBook.tags.join(", ")}`
        : "Một câu chuyện ngẫu nhiên đang chờ bạn khám phá.");
  }
}

function openFeaturedBook() {
  if (!featuredBookId) {
    renderFeaturedBook();
  }

  if (featuredBookId) {
    openReader(featuredBookId, 0);
  }
}



function pickRandomRankingBooks(limit = 5) {
  if (!Array.isArray(books) || books.length === 0) return [];

  const validBooks = books.filter((book) => Number(book.id) && book.file);
  const shuffled = [...validBooks].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, limit);
}

function renderRandomRankings() {
  const rankingBooks = pickRandomRankingBooks(5);

  if (rankingList) {
    rankingList.innerHTML = rankingBooks
      .map((book) => `
        <li data-book-id="${escapeHtml(book.id)}">${escapeHtml(book.title || "Không có tên")}</li>
      `)
      .join("");
  }

  if (mobileRankingMenu) {
    mobileRankingMenu.innerHTML = rankingBooks
      .map((book) => `
        <button class="mobile-subitem" type="button" data-ranking-book="${escapeHtml(book.id)}">
          ${escapeHtml(book.title || "Không có tên")}
        </button>
      `)
      .join("");
  }
}


async function loadBooks() {
  try {
    if (!booksGrid) return;

    booksGrid.innerHTML = '<div class="empty-state">Đang tải truyện...</div>';

    const res = await fetch("data/books-index.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error("books-index.json không phải mảng");
    }

    books = data.map((book, index) =>
      normalizeBook(
        {
          ...book,
          chapters: []
        },
        {
          id: Number(book?.id ?? index + 1),
          chapterCount: Number(book?.chapterCount ?? 0)
        }
      )
    );

    renderCategoryControls();
    collapseCategoryExtrasByDefault();
    renderFeaturedBook();
    renderRandomRankings();
    renderBooks();
  } catch (error) {
    console.error("Không tải được books-index.json:", error);


  if (rankingList) {
    rankingList.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const item = target.closest("[data-book-id]");
      if (!item) return;

      e.preventDefault();
      openReader(item.dataset.bookId, 0);
    });
  }

  if (booksGrid) {
      booksGrid.innerHTML =
        '<div class="empty-state">Không tải được dữ liệu truyện. Hãy chạy web bằng local server.</div>';
    }

    if (pagination) {
      pagination.innerHTML = "";
    }
  }
}

function bindEvents() {
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const toggleBtn = target.closest("[data-category-toggle]");
    if (toggleBtn) {
      e.preventDefault();
      toggleCategoryList(toggleBtn);
    }
  });

  if (homeBtn) homeBtn.addEventListener("click", goHome);
  if (homeLink) homeLink.addEventListener("click", goHome);
  if (shelfLink) shelfLink.addEventListener("click", openShelfView);
  if (rankingLink) rankingLink.addEventListener("click", openRankingSection);
  if (categoryLink) categoryLink.addEventListener("click", openCategorySection);

  if (mobileSearchToggle) {
    mobileSearchToggle.addEventListener("click", toggleMobileSearch);
  }

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", toggleMobileMenu);
  }

  if (mobileRankingToggle) {
    mobileRankingToggle.addEventListener("click", toggleMobileRanking);
  }

  if (mobileCategoryToggle) {
    mobileCategoryToggle.addEventListener("click", toggleMobileCategory);
  }

  if (mainNav) {
    mainNav.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const mobileChip = target.getAttribute("data-mobile-chip");
      const rankingBook = target.getAttribute("data-ranking-book");

      if (mobileChip) {
        e.preventDefault();
        setActiveChip(mobileChip);
        closeMobilePanels();
        updateMobileToggleState();

        const booksSection = $("booksSection");
        if (booksSection) {
          booksSection.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }

      if (rankingBook) {
        e.preventDefault();
        openReader(rankingBook, 0);
      }
    });
  }

  if (booksGrid) {
    booksGrid.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const readId = target.getAttribute("data-id");
      const continueId = target.getAttribute("data-continue");
      const saveId = target.getAttribute("data-save");

      if (readId) {
        openReader(readId, 0);
        return;
      }

      if (continueId) {
        openReader(continueId, null);
        return;
      }

      if (saveId) {
        e.stopPropagation();

        const book = books.find((item) => Number(item.id) === Number(saveId));
        if (!book) return;

        const saved = toggleShelf(book.id);

        if (currentBook && Number(currentBook.id) === Number(book.id)) {
          updateSaveShelfButton(book.id);
        }

        renderBooks();

        alert(
          saved
            ? `Đã lưu "${book.title}" vào tủ sách.`
            : `Đã bỏ "${book.title}" khỏi tủ sách.`
        );
        return;
      }

      const card = target.closest(".book-card");
      if (card?.dataset.id) {
        openReader(card.dataset.id, null);
      }
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      currentPage = 1;
      renderBooks();
      if (isMobileView()) {
        closeMobilePanels();
        updateMobileToggleState();
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        currentPage = 1;
        renderBooks();
        if (isMobileView()) {
          closeMobilePanels();
          updateMobileToggleState();
        }
      }
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentPage = 1;
      renderBooks();
    });
  }

  if (authorFilter) {
    authorFilter.addEventListener("input", () => {
      currentPage = 1;
      renderBooks();
    });
  }

  if (chipGroup) {
    chipGroup.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const chip = target.getAttribute("data-chip");
      if (!chip) return;

      setActiveChip(chip);
    });
  }

  const menuList = document.querySelector(".menu-list");
  if (menuList) {
    menuList.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const link = target.closest("a[data-chip]");
      if (!link) return;

      e.preventDefault();
      const chip = link.dataset.chip || "all";
      setActiveChip(chip);
      closeMobilePanels();
      updateMobileToggleState();
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", backHome);
  }

  if (fontSizeRange) {
    fontSizeRange.addEventListener("input", () => {
      if (readerBody) {
        readerBody.style.fontSize = `${fontSizeRange.value}px`;
      }
      localStorage.setItem(STORAGE_KEYS.fontSize, fontSizeRange.value);
    });
  }

  if (readerWidthRange) {
    readerWidthRange.addEventListener("input", () => {
      document.documentElement.style.setProperty(
        "--reader-width",
        `${readerWidthRange.value}px`
      );
      localStorage.setItem(STORAGE_KEYS.readerWidth, readerWidthRange.value);
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener("change", () => {
      applyTheme(themeSelect.value);
    });
  }

  if (chapterSelect) {
    chapterSelect.addEventListener("change", () => {
      const idx = Number(chapterSelect.value);
      if (!Number.isNaN(idx)) {
        openChapter(idx);
      }
    });
  }

  if (prevChapterBtn) {
    prevChapterBtn.addEventListener("click", () => {
      if (currentBook && currentChapterIndex > 0) {
        openChapter(currentChapterIndex - 1);
      }
    });
  }

  if (nextChapterBtn) {
    nextChapterBtn.addEventListener("click", () => {
      if (
        currentBook &&
        Array.isArray(currentBook.chapters) &&
        currentChapterIndex < currentBook.chapters.length - 1
      ) {
        openChapter(currentChapterIndex + 1);
      }
    });
  }

  if (saveShelfBtn) {
    saveShelfBtn.addEventListener("click", () => {
      if (!currentBook) return;

      const saved = toggleShelf(currentBook.id);
      updateSaveShelfButton(currentBook.id);
      renderBooks();

      alert(
        saved
          ? `Đã lưu "${currentBook.title}" vào tủ sách.`
          : `Đã bỏ "${currentBook.title}" khỏi tủ sách.`
      );
    });
  }

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (scrollBooksBtn) {
    scrollBooksBtn.addEventListener("click", () => {
      const booksSection = $("booksSection");
      if (booksSection) {
        booksSection.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  if (openFeaturedBtn) {
    openFeaturedBtn.addEventListener("click", openFeaturedBook);
  }

  if (featuredCard) {
    featuredCard.addEventListener("click", openFeaturedBook);
    featuredCard.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFeaturedBook();
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!isMobileView()) return;

    const target = e.target;
    if (!(target instanceof Element)) return;

    const insideTopbar = target.closest(".topbar");
    if (!insideTopbar) {
      closeMobilePanels();
      updateMobileToggleState();
    }
  });

  window.addEventListener("scroll", handleMobileTopbarScroll, { passive: true });

  window.addEventListener("resize", () => {
    if (!isMobileView()) {
      closeMobilePanels();
      updateMobileToggleState();
    }
    lastScrollY = window.scrollY || 0;
    handleMobileTopbarScroll();
  });
}

function initDomRefs() {
  booksGrid = $("booksGrid");
  pagination = $("pagination");
  searchInput = $("searchInput");
  searchBtn = $("searchBtn");
  sortSelect = $("sortSelect");
  authorFilter = $("authorFilter");
  chipGroup = $("chipGroup");
  homeView = $("homeView");
  readerView = $("readerView");
  readerTitle = $("readerTitle");
  readerMeta = $("readerMeta");
  readerBody = $("readerBody");
  readerCover = $("readerCover");
  readerAuthor = $("readerAuthor");
  readerTags = $("readerTags");
  readerDesc = $("readerDesc");
  chapterList = $("chapterList");
  chapterSelect = $("chapterSelect");
  backBtn = $("backBtn");
  fontSizeRange = $("fontSizeRange");
  readerWidthRange = $("readerWidthRange");
  themeSelect = $("themeSelect");
  prevChapterBtn = $("prevChapterBtn");
  nextChapterBtn = $("nextChapterBtn");
  saveShelfBtn = $("saveShelfBtn");
  scrollTopBtn = $("scrollTopBtn");
  scrollBooksBtn = $("scrollBooksBtn");
  openFeaturedBtn = $("openFeaturedBtn");
  featuredCard = $("featuredCard");
  featuredCover = $("featuredCover");
  featuredTitle = $("featuredTitle");
  featuredDesc = $("featuredDesc");
  homeBtn = $("homeBtn");
  homeLink = $("homeLink");
  rankingLink = $("rankingLink");
  categoryLink = $("categoryLink");
  mobileSearchToggle = $("mobileSearchToggle");
  mobileMenuToggle = $("mobileMenuToggle");
  searchWrap = $("searchWrap");
  mainNav = $("mainNav");
  mobileRankingToggle = $("mobileRankingToggle");
  mobileCategoryToggle = $("mobileCategoryToggle");
  mobileRankingMenu = $("mobileRankingMenu");
  mobileCategoryMenu = $("mobileCategoryMenu");
  rankingList = $("rankingList");

  shelfLink = $("shelfLink") || document.querySelector('.nav a:nth-child(4)');
  booksPanelTitle = $("booksPanelTitle");
}

document.addEventListener("DOMContentLoaded", () => {
  const savedShelfRaw = localStorage.getItem(STORAGE_KEYS.shelf);
  if (savedShelfRaw === null || savedShelfRaw === "null") {
    localStorage.setItem(STORAGE_KEYS.shelf, JSON.stringify([]));
  }

  const progressRaw = localStorage.getItem(STORAGE_KEYS.progress);
  if (progressRaw === null || progressRaw === "null") {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify({}));
  }

  initDomRefs();
  applyMobileButtonIcons();
  updateMobileToggleState();
  bindEvents();
  applySavedReaderSettings();
  updateBooksPanelTitle();
  loadBooks();

  lastScrollY = window.scrollY || 0;
  handleMobileTopbarScroll();
});
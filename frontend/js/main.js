import { apiUrl, normalizeAudioUrl } from "./api.js";
import { $, assetUrl, escapeHtml, safeParseJSON } from "./ui.js";
import {
  clearAuthToken as clearStoredAuthToken,
  getAuthHeaders as getStoredAuthHeaders,
  getAuthToken as getStoredAuthToken,
  isLoggedIn as hasStoredLogin,
  setAuthToken as setStoredAuthToken
} from "./auth.js";
import {
  addRemoteBookmark as postRemoteBookmark,
  deleteRemoteBookmark as removeRemoteBookmark,
  getSavedShelf as getStoredShelf,
  isBookSaved as isStoredBookSaved,
  removeFromShelf as removeStoredShelfItem,
  saveToShelf as saveStoredShelfItem,
  setSavedShelf as setStoredShelf
} from "./bookmarks.js";
import {
  getReadingProgress as getStoredReadingProgress,
  getReadingProgressMap as getStoredReadingProgressMap,
  saveRemoteReadingProgress as postRemoteReadingProgress,
  setReadingProgress as setStoredReadingProgress,
  setReadingProgressMap as setStoredReadingProgressMap
} from "./progress.js";
import {
  fetchBookComments,
  formatCommentTime as formatCommentTimestamp,
  getCommentUserLabel as getRenderedCommentUserLabel,
  postBookComment
} from "./comments.js";
import { fetchTrendingBooks, shuffleArray as shuffleRelatedArray } from "./related.js";
import { setupChapterAudioPlayer as setupAudioPlayer } from "./audio.js";

let books = [];

let activeChip = "all";
let currentBook = null;
let currentChapterIndex = 0;
let currentPage = 1;
let showShelfOnly = false;
let continueExpanded = false;
let appReady = false;

let lastScrollY = 0;
let mobileTopbarTicking = false;
let currentFetchController = null;
let searchModeActive = false;
let searchResults = [];
let searchDebounceTimer = null;
let progressSyncTimer = null;
let searchFetchController = null;
const bookDetailCache = new Map();
const BOOK_DETAIL_CACHE_MAX = 80;
const BOOKS_CACHE_KEY = "truyenfullvnBooksCacheV1";
const BOOKS_CACHE_TTL_MS = 10 * 60 * 1000;

const booksPerPage = 6;

const STORAGE_KEYS = {
  theme: "readerTheme",
  fontSize: "readerFontSize",
  readerWidth: "readerWidth",
  shelf: "savedShelf",
  progress: "readingProgress",
  lastBookId: "lastReadBookId",
  authToken: "authToken",
  authEmail: "authEmail",
  audioSpeed: "audioSpeed"
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
let continueReadingPanel;
let continueReadingGrid;
let continueRefreshBtn;
let continueToggleBtn;
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
let loginLink;
let logoutLink;
let authModal;
let authCloseBtn;
let authEmail;
let authPassword;
let authPasswordConfirm;
let authPasswordConfirmWrap;
let authModeLoginBtn;
let authModeRegisterBtn;
let authBackLoginBtn;
let authLoginBtn;
let authRegisterBtn;
let authTitle;
let authMessage;
let accountModal;
let accountCloseBtn;
let accountEmail;
let accountLogoutBtn;
let accountShelfList;
let accountProgressList;
let commentsSection;
let commentsHint;
let commentsRefreshBtn;
let commentForm;
let commentInput;
let commentStatus;
let commentSubmitBtn;
let commentsList;
let relatedBooksSection;
let relatedBooksGrid;
let relatedMoreBtn;

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
      searchOpen ? "ÄÃ³ng tÃ¬m kiáº¿m" : "Má»Ÿ tÃ¬m kiáº¿m"
    );
    mobileSearchToggle.classList.toggle("active", searchOpen);
  }

  if (mobileMenuToggle) {
    const menuOpen = document.body.classList.contains("mobile-menu-open");
    mobileMenuToggle.setAttribute("aria-expanded", String(menuOpen));
    mobileMenuToggle.setAttribute(
      "aria-label",
      menuOpen ? "ÄÃ³ng menu" : "Má»Ÿ menu"
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
        title: chapter?.title || `ChÆ°Æ¡ng ${index + 1}`,
        content: Array.isArray(chapter?.content)
          ? chapter.content
              .map((p) => String(p ?? "").trim())
              .filter((p) => p !== "")
          : [],
        audio: normalizeAudioUrl(chapter?.audio || chapter?.audioUrl || chapter?.audio_url || ""),
        video: chapter?.video || chapter?.videoUrl || chapter?.video_url || ""
      }))
    : [];

  return {
    id: Number(fullBook?.id ?? fallback?.id ?? 0),
    title: fullBook?.title || fallback?.title || "KhÃ´ng cÃ³ tÃªn",
    author: fullBook?.author || fallback?.author || "ChÆ°a rÃµ",
    tags: Array.isArray(fullBook?.tags)
      ? fullBook.tags
      : Array.isArray(fallback?.tags)
        ? fallback.tags
        : [],
    popularity: Number(fullBook?.popularity ?? fallback?.popularity ?? 0),
    desc: fullBook?.desc || fallback?.desc || "",
    cover: fullBook?.cover || fallback?.cover || "images/default.jpg",
    file: fullBook?.file || fallback?.file || "",
    seoUrl:
      fullBook?.seoUrl ||
      fullBook?.seo_url ||
      fallback?.seoUrl ||
      fallback?.seo_url ||
      `book-${Number(fullBook?.id ?? fallback?.id ?? 0)}`,
    chapterCount:
      normalizedChapters.length ||
      Number(
        fullBook?.chapterCount ??
        fullBook?.chapter_count ??
        fallback?.chapterCount ??
        fallback?.chapter_count ??
        0
      ),
    chapters: normalizedChapters
  };
}

function getBookChapterCount(book) {
  const count = Number(
    book?.chapterCount || (Array.isArray(book?.chapters) ? book.chapters.length : 0)
  );
  return Number.isFinite(count) && count >= 0 ? count : 0;
}


function getAuthToken() {
  return getStoredAuthToken(STORAGE_KEYS);
}

function setAuthToken(token) {
  setStoredAuthToken(STORAGE_KEYS, token);
}

function clearAuthToken() {
  clearStoredAuthToken(STORAGE_KEYS);
}

function isLoggedIn() {
  return hasStoredLogin(STORAGE_KEYS);
}

function getAuthHeaders(extraHeaders = {}) {
  return getStoredAuthHeaders(STORAGE_KEYS, extraHeaders);
}

function setAuthMessage(message, type = "") {
  if (!authMessage) return;
  authMessage.textContent = message || "";
  authMessage.classList.remove("success", "error");
  if (type) authMessage.classList.add(type);
}


let authMode = "login";

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  if (authTitle) {
    authTitle.textContent = authMode === "register" ? "ÄÄƒng kÃ½ TruyenFullvn" : "ÄÄƒng nháº­p TruyenFullvn";
  }

  if (authPasswordConfirmWrap) {
    authPasswordConfirmWrap.classList.toggle("hidden", authMode !== "register");
  }

  if (authPassword) {
    authPassword.autocomplete = authMode === "register" ? "new-password" : "current-password";
  }

  if (authLoginBtn) {
    authLoginBtn.classList.toggle("hidden", authMode !== "login");
  }

  if (authModeRegisterBtn) {
    authModeRegisterBtn.classList.toggle("hidden", authMode !== "login");
  }

  if (authRegisterBtn) {
    authRegisterBtn.classList.toggle("hidden", authMode !== "register");
  }

  if (authBackLoginBtn) {
    authBackLoginBtn.classList.toggle("hidden", authMode !== "register");
  }

  setAuthMessage("");
}


function openAuthModal(e) {
  if (e) e.preventDefault();

  if (!authModal) return;
  authModal.classList.remove("hidden");
  authModal.setAttribute("aria-hidden", "false");
  setAuthMode("login");
  setAuthMessage("");

  setTimeout(() => {
    if (authEmail) authEmail.focus();
  }, 80);
}

function closeAuthModal(e) {
  if (e) e.preventDefault();

  if (!authModal) return;
  authModal.classList.add("hidden");
  authModal.setAttribute("aria-hidden", "true");
  setAuthMessage("");
}


function openAccountModal(e) {
  if (e) e.preventDefault();

  if (!isLoggedIn()) {
    openAuthModal(e);
    return;
  }

  if (!accountModal) return;

  accountModal.classList.remove("hidden");
  accountModal.setAttribute("aria-hidden", "false");
  renderAccountPanel();
}

function closeAccountModal(e) {
  if (e) e.preventDefault();

  if (!accountModal) return;

  accountModal.classList.add("hidden");
  accountModal.setAttribute("aria-hidden", "true");
}

function setAccountTab(tabId) {
  document.querySelectorAll(".account-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.accountTab === tabId);
  });

  document.querySelectorAll(".account-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

function findBookById(bookId) {
  const id = Number(bookId);
  return books.find((book) => Number(book.id) === id) || null;
}

function makeAccountBookItem(book, extraText = "", chapterIndex = 0) {
  const safeTitle = escapeHtml(book?.title || `Truyá»‡n #${book?.id || ""}`);
  const safeMeta = escapeHtml(extraText || `${book?.author || "ChÆ°a rÃµ"} â€¢ ${getBookChapterCount(book)} chÆ°Æ¡ng`);
  const cover = escapeHtml(assetUrl(book?.cover || "images/default.jpg"));
  const id = Number(book?.id || 0);
  const chapter = Math.max(0, Number(chapterIndex) || 0);

  return `
    <button class="account-book-item" type="button" data-account-book="${id}" data-account-chapter="${chapter}">
      <img src="${cover}" alt="BÃ¬a ${safeTitle}" onerror="this.onerror=null;this.src='/images/default.jpg'" />
      <span>
        <strong>${safeTitle}</strong>
        <small>${safeMeta}</small>
      </span>
    </button>
  `;
}

function renderAccountPanel() {
  const email = localStorage.getItem(STORAGE_KEYS.authEmail) || "NgÆ°á»i Ä‘á»c TruyenFullvn";

  if (accountEmail) {
    accountEmail.textContent = email;
  }

  const shelfIds = getSavedShelf();
  const shelfBooks = shelfIds
    .map((id) => findBookById(id))
    .filter(Boolean);

  if (accountShelfList) {
    accountShelfList.innerHTML = shelfBooks.length
      ? shelfBooks
          .map((book) => makeAccountBookItem(
            book,
            `${book.author || "ChÆ°a rÃµ"} â€¢ ${getBookChapterCount(book)} chÆ°Æ¡ng`,
            getReadingProgress(book.id)
          ))
          .join("")
      : '<div class="account-empty">ChÆ°a cÃ³ truyá»‡n trong tá»§ sÃ¡ch.</div>';
  }

  const progressMap = getReadingProgressMap();
  const progressBooks = Object.entries(progressMap)
    .map(([bookId, chapterIndex]) => ({
      book: findBookById(bookId),
      chapterIndex: Number(chapterIndex) || 0
    }))
    .filter((item) => item.book);

  progressBooks.sort((a, b) => Number(b.book.id) - Number(a.book.id));

  if (accountProgressList) {
    accountProgressList.innerHTML = progressBooks.length
      ? progressBooks
          .map(({ book, chapterIndex }) => {
            const total = Math.max(getBookChapterCount(book), 1);
            const chapterNumber = Math.min(chapterIndex + 1, total);
            return makeAccountBookItem(
              book,
              `Äang Ä‘á»c chÆ°Æ¡ng ${chapterNumber}/${total}`,
              chapterIndex
            );
          })
          .join("")
      : '<div class="account-empty">ChÆ°a cÃ³ tiáº¿n Ä‘á»™ Ä‘á»c.</div>';
  }
}


function updateAuthUI() {
  const email = localStorage.getItem(STORAGE_KEYS.authEmail) || "";


  if (loginLink) {
    loginLink.textContent = email ? `Xin chÃ o ${email}` : "ÄÄƒng nháº­p";
    loginLink.classList.toggle("logged-in", !!email);
  }

  if (logoutLink) {
    logoutLink.classList.toggle("hidden", !email);
  }

  updateCommentLoginState();
}

async function authRequest(endpoint) {
  const email = authEmail?.value?.trim() || "";
  const password = authPassword?.value || "";
  const passwordConfirm = authPasswordConfirm?.value || "";
  const isRegister = endpoint.includes("register");

  if (!email || !password) {
    setAuthMessage("Vui lÃ²ng nháº­p email vÃ  máº­t kháº©u.", "error");
    return;
  }

  if (password.length < 6) {
    setAuthMessage("Máº­t kháº©u cáº§n tá»‘i thiá»ƒu 6 kÃ½ tá»±.", "error");
    return;
  }

  if (isRegister && password !== passwordConfirm) {
    setAuthMessage("Máº­t kháº©u nháº­p láº¡i khÃ´ng khá»›p.", "error");
    return;
  }

  setAuthMessage("Äang xá»­ lÃ½...");

  try {
    const res = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.detail || `HTTP ${res.status}`);
    }

    if (!data.access_token) {
      throw new Error("Backend khÃ´ng tráº£ access_token.");
    }

    setAuthToken(data.access_token);
    localStorage.setItem(STORAGE_KEYS.authEmail, email);
    if (authPasswordConfirm) authPasswordConfirm.value = "";

    await syncBookmarksFromAPI();
    await syncReadingProgressFromAPI();

    updateAuthUI();
    if (accountModal && !accountModal.classList.contains('hidden')) renderAccountPanel();
    updateSaveShelfButton(currentBook?.id);
    renderBooks();

    setAuthMessage("ÄÄƒng nháº­p thÃ nh cÃ´ng.", "success");
    setTimeout(() => closeAuthModal(), 450);
  } catch (err) {
    setAuthMessage(`Lá»—i: ${err.message}`, "error");
  }
}

async function checkCurrentUser() {
  if (!isLoggedIn()) {
    updateAuthUI();
    return;
  }

  try {
    const res = await fetch(apiUrl("/api/me"), {
      headers: getAuthHeaders(),
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const user = await res.json();
    if (user?.email) {
      localStorage.setItem(STORAGE_KEYS.authEmail, user.email);
    }

    await syncBookmarksFromAPI();
    await syncReadingProgressFromAPI();
  } catch (err) {
    console.warn("Token khÃ´ng há»£p lá»‡ hoáº·c backend chÆ°a báº­t:", err);
    clearAuthToken();
  }

  updateAuthUI();
  if (accountModal && !accountModal.classList.contains('hidden')) renderAccountPanel();
}

async function syncBookmarksFromAPI() {
  if (!isLoggedIn()) return;

  try {
    const res = await fetch(apiUrl("/api/bookmarks"), {
      headers: getAuthHeaders(),
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (Array.isArray(data)) {
      const ids = data
        .map((item) => Number(item.book_id))
        .filter(Number.isFinite);

      const merged = Array.from(new Set([...getSavedShelf(), ...ids]));
      setSavedShelf(merged);
    }
  } catch (err) {
    console.warn("KhÃ´ng sync Ä‘Æ°á»£c bookmarks tá»« API:", err);
  }
}


async function saveRemoteReadingProgress(bookId, chapterNumber) {
  if (!isLoggedIn()) return;

  try {
    const res = await postRemoteReadingProgress(
      bookId,
      chapterNumber,
      getAuthHeaders({ "Content-Type": "application/json" })
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("KhÃ´ng lÆ°u Ä‘Æ°á»£c tiáº¿n Ä‘á»™ Ä‘á»c lÃªn server:", err);
  }
}

function saveRemoteReadingProgressDebounced(bookId, chapterNumber) {
  clearTimeout(progressSyncTimer);

  progressSyncTimer = setTimeout(() => {
    saveRemoteReadingProgress(bookId, chapterNumber);
  }, 500);
}

async function syncReadingProgressFromAPI() {
  if (!isLoggedIn()) return;

  try {
    const res = await fetch(apiUrl("/api/progress"), {
      headers: getAuthHeaders(),
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!Array.isArray(data)) return;

    const progress = getReadingProgressMap();

    data.forEach((item) => {
      const bookId = Number(item.book_id);
      const chapterNumber = Number(item.chapter_number);

      if (!Number.isFinite(bookId) || !Number.isFinite(chapterNumber)) return;

      progress[String(bookId)] = Math.max(0, chapterNumber - 1);
    });

    setReadingProgressMap(progress);
    renderContinueReadingPanel();
  } catch (err) {
    console.warn("KhÃ´ng sync Ä‘Æ°á»£c tiáº¿n Ä‘á»™ Ä‘á»c tá»« API:", err);
  }
}


async function addRemoteBookmark(bookId, chapterNumber = 1) {
  const res = await postRemoteBookmark(
    bookId,
    chapterNumber,
    getAuthHeaders({ "Content-Type": "application/json" })
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `HTTP ${res.status}`);
  }

  return data;
}

async function deleteRemoteBookmark(bookId) {
  const res = await removeRemoteBookmark(bookId, getAuthHeaders());

  if (res.status === 404) {
    return { message: "Bookmark not found" };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `HTTP ${res.status}`);
  }

  return data;
}

async function toggleShelfSmart(bookId, chapterNumber = 1) {
  const id = Number(bookId);
  const wasSaved = isBookSaved(id);

  if (isLoggedIn()) {
    try {
      if (wasSaved) {
        await deleteRemoteBookmark(id);
        removeFromShelf(id);
        return false;
      }

      await addRemoteBookmark(id, chapterNumber);
      saveToShelf(id);
      return true;
    } catch (err) {
      console.warn("Bookmark API lá»—i, fallback localStorage:", err);
    }
  } else {
    openAuthModal();
  }

  return toggleShelf(id);
}

function logoutUser(e) {
  if (e) e.preventDefault();

  clearAuthToken();
  updateAuthUI();

  if (currentBook) {
    updateSaveShelfButton(currentBook.id);
  }

  renderBooks();
  alert("Báº¡n Ä‘Ã£ Ä‘Äƒng xuáº¥t.");
}


function getCommentUserLabel(comment) {
  return getRenderedCommentUserLabel(comment);
}

function formatCommentTime(value) {
  return formatCommentTimestamp(value);
}

function setCommentStatus(message, type = "") {
  if (!commentStatus) return;

  commentStatus.textContent = message || "";
  commentStatus.classList.remove("success", "error");

  if (type) {
    commentStatus.classList.add(type);
  }
}

function renderComments(comments) {
  if (!commentsList) return;

  if (!Array.isArray(comments) || !comments.length) {
    commentsList.innerHTML = '<div class="comment-empty">ChÆ°a cÃ³ bÃ¬nh luáº­n nÃ o. HÃ£y lÃ  ngÆ°á»i Ä‘áº§u tiÃªn bÃ¬nh luáº­n truyá»‡n nÃ y.</div>';
    return;
  }

  commentsList.innerHTML = comments.map((comment) => {
    const userLabel = escapeHtml(getCommentUserLabel(comment));
    const content = escapeHtml(comment?.content || "");
    const time = escapeHtml(formatCommentTime(comment?.created_at));
    const likes = Number(comment?.likes || 0);

    return `
      <article class="comment-item">
        <div class="comment-avatar">${userLabel.slice(0, 1).toUpperCase()}</div>
        <div class="comment-body-box">
          <div class="comment-meta">
            <strong>${userLabel}</strong>
            <span>${time}</span>
          </div>
          <div class="comment-content">${content}</div>
          <div class="comment-actions-row">
            <span>â™¡ ${likes}</span>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function loadBookComments() {
  if (!currentBook || !commentsList) return;

  commentsList.innerHTML = '<div class="comment-empty">Äang táº£i bÃ¬nh luáº­n...</div>';
  setCommentStatus("");

  try {
    const res = await fetchBookComments(currentBook.id);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const comments = await res.json();
    renderComments(comments);

    if (commentsHint) {
      commentsHint.textContent = `BÃ¬nh luáº­n chung cho truyá»‡n "${currentBook.title}".`;
    }
  } catch (err) {
    console.warn("KhÃ´ng táº£i Ä‘Æ°á»£c bÃ¬nh luáº­n:", err);
    commentsList.innerHTML = '<div class="comment-empty">ChÆ°a táº£i Ä‘Æ°á»£c bÃ¬nh luáº­n. Kiá»ƒm tra backend hoáº·c API comments.</div>';
  }
}

async function submitBookComment() {
  if (!currentBook) return;

  if (!isLoggedIn()) {
    setCommentStatus("Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ bÃ¬nh luáº­n.", "error");
    openAuthModal();
    return;
  }

  const content = commentInput?.value?.trim() || "";

  if (!content) {
    setCommentStatus("Vui lÃ²ng nháº­p ná»™i dung bÃ¬nh luáº­n.", "error");
    return;
  }

  if (content.length > 1000) {
    setCommentStatus("BÃ¬nh luáº­n tá»‘i Ä‘a 1000 kÃ½ tá»±.", "error");
    return;
  }

  setCommentStatus("Äang gá»­i...");

  try {
    const res = await postBookComment(
      currentBook.id,
      content,
      getAuthHeaders({ "Content-Type": "application/json" })
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.detail || `HTTP ${res.status}`);
    }

    if (commentInput) {
      commentInput.value = "";
    }

    setCommentStatus("ÄÃ£ gá»­i bÃ¬nh luáº­n.", "success");
    await loadBookComments();
  } catch (err) {
    console.warn("KhÃ´ng gá»­i Ä‘Æ°á»£c bÃ¬nh luáº­n:", err);
    setCommentStatus(`Lá»—i: ${err.message}`, "error");
  }
}

function updateCommentLoginState() {
  if (!commentForm) return;

  const loggedIn = isLoggedIn();
  commentForm.classList.toggle("is-logged-out", !loggedIn);

  if (commentInput) {
    commentInput.placeholder = loggedIn
      ? "Viáº¿t bÃ¬nh luáº­n cá»§a báº¡n vá» truyá»‡n nÃ y..."
      : "ÄÄƒng nháº­p Ä‘á»ƒ bÃ¬nh luáº­n vá» truyá»‡n nÃ y...";
  }

  if (commentSubmitBtn) {
    commentSubmitBtn.textContent = loggedIn ? "Gá»­i bÃ¬nh luáº­n" : "ÄÄƒng nháº­p Ä‘á»ƒ bÃ¬nh luáº­n";
  }
}



function getCachedBooksIndex() {
  const cached = safeParseJSON(localStorage.getItem(BOOKS_CACHE_KEY), null);

  if (!cached || !Array.isArray(cached.items)) return null;

  const savedAt = Number(cached.savedAt || 0);
  if (!savedAt || Date.now() - savedAt > BOOKS_CACHE_TTL_MS) {
    localStorage.removeItem(BOOKS_CACHE_KEY);
    return null;
  }

  return cached.items;
}

function setCachedBooksIndex(items) {
  if (!Array.isArray(items) || !items.length) return;

  try {
    localStorage.setItem(BOOKS_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      items
    }));
  } catch (err) {
    console.warn("KhÃ´ng lÆ°u Ä‘Æ°á»£c cache danh sÃ¡ch truyá»‡n:", err);
  }
}

function setBookDetailCache(bookId, fullBookData) {
  const id = String(bookId);
  if (!id || !fullBookData) return;

  if (bookDetailCache.has(id)) {
    bookDetailCache.delete(id);
  }

  bookDetailCache.set(id, {
    savedAt: Date.now(),
    data: fullBookData
  });

  while (bookDetailCache.size > BOOK_DETAIL_CACHE_MAX) {
    const oldestKey = bookDetailCache.keys().next().value;
    bookDetailCache.delete(oldestKey);
  }
}

function getBookDetailCache(bookId) {
  const item = bookDetailCache.get(String(bookId));
  return item?.data || null;
}

function showBooksSkeleton(count = booksPerPage) {
  if (!booksGrid) return;

  booksGrid.innerHTML = Array.from({ length: count }).map(() => `
    <div class="book-card skeleton-card" aria-hidden="true">
      <div class="book-thumb skeleton-box"></div>
      <div class="book-body">
        <div class="skeleton-line wide"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>
  `).join("");
}

function getContinueReadingItems() {
  const progressMap = getReadingProgressMap();

  return Object.entries(progressMap)
    .map(([bookId, chapterIndex]) => {
      const book = books.find((item) => Number(item.id) === Number(bookId));
      if (!book) return null;

      const total = Math.max(getBookChapterCount(book), 1);
      const safeIndex = Math.min(Math.max(Number(chapterIndex) || 0, 0), total - 1);

      return {
        book,
        chapterIndex: safeIndex,
        chapterNumber: safeIndex + 1,
        total
      };
    })
    .filter(Boolean);
}

function renderContinueReadingPanel() {
  const panel = document.getElementById("continueReadingPanel");
  const grid = document.getElementById("continueReadingGrid");
  const toggleBtn = document.getElementById("continueToggleBtn");

  if (!panel || !grid) return;

  const allItems = getContinueReadingItems();
  const visibleItems = continueExpanded ? allItems.slice(0, 6) : allItems.slice(0, 2);

  panel.classList.toggle("hidden", allItems.length === 0);
  grid.classList.toggle("expanded", continueExpanded && allItems.length > 2);

  if (toggleBtn) {
    toggleBtn.classList.toggle("hidden", allItems.length <= 2);
    toggleBtn.textContent = continueExpanded
      ? "Thu gá»n â–´"
      : `ThÃªm ${Math.min(Math.max(allItems.length - 2, 0), 4)} truyá»‡n â–¾`;
  }

  if (!allItems.length) {
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = visibleItems.map(({ book, chapterIndex, chapterNumber, total }) => {
    const cover = escapeHtml(assetUrl(book.cover || "images/default.jpg"));
    const title = escapeHtml(book.title || "KhÃ´ng cÃ³ tÃªn");
    const author = escapeHtml(book.author || "ChÆ°a rÃµ");
    const pct = Math.max(3, Math.min(100, Math.round((chapterNumber / Math.max(total, 1)) * 100)));

    return `
      <button class="continue-card" type="button" data-continue-book="${escapeHtml(book.id)}" data-continue-chapter="${chapterIndex}">
        <img src="${cover}" alt="BÃ¬a ${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/default.jpg'" />
        <span class="continue-info">
          <strong>${title}</strong>
          <small>${author} â€¢ ChÆ°Æ¡ng ${chapterNumber}/${total}</small>
          <span class="continue-progress-bar"><span style="width:${pct}%"></span></span>
        </span>
      </button>
    `;
  }).join("");
}

function refreshContinueReadingPanel() {
  syncReadingProgressFromAPI()
    .catch(() => {})
    .finally(() => {
      renderContinueReadingPanel();
      renderBooks();
    });
}



let relatedBooksVisibleCount = 4;
let relatedBooksPool = [];
let relatedBooksPoolBookId = null;

function shuffleArray(items) {
  return shuffleRelatedArray(items);
}

function buildRelatedBooksPool() {
  if (!currentBook || !Array.isArray(books) || !books.length) {
    relatedBooksPool = [];
    relatedBooksPoolBookId = null;
    return;
  }

  const currentId = Number(currentBook.id);
  const currentTags = Array.isArray(currentBook.tags)
    ? currentBook.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
    : [];

  let candidates = books.filter((book) => {
    if (Number(book.id) === currentId) return false;
    if (!currentTags.length || !Array.isArray(book.tags)) return false;

    return book.tags.some((tag) =>
      currentTags.includes(String(tag).trim().toLowerCase())
    );
  });

  if (candidates.length < 4) {
    const existing = new Set(candidates.map((book) => Number(book.id)));
    const fallback = books.filter((book) => {
      const id = Number(book.id);
      return id !== currentId && !existing.has(id);
    });

    candidates = [...candidates, ...fallback];
  }

  relatedBooksPool = shuffleArray(candidates);
  relatedBooksPoolBookId = currentId;
}


async function loadRelatedBooksFromAPIFallback() {
  if (!currentBook || !relatedBooksGrid) return;

  try {
    const res = await fetchTrendingBooks(12);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) return;

    const currentId = Number(currentBook.id);
    const items = data
      .map((book, index) => normalizeBook(
        {
          ...book,
          chapterCount: book.chapter_count,
          seoUrl: book.seo_url,
          chapters: []
        },
        { id: Number(book?.id ?? index + 1) }
      ))
      .filter((book) => Number(book.id) !== currentId);

    if (!items.length) return;

    relatedBooksPool = shuffleArray(items);
    relatedBooksPoolBookId = currentId;
    relatedBooksVisibleCount = 4;
    renderRelatedBooks(false);
  } catch (err) {
    console.warn("KhÃ´ng táº£i Ä‘Æ°á»£c gá»£i Ã½ fallback:", err);
  }
}


function renderRelatedBooks(reset = false) {
  const section = document.getElementById("relatedBooksSection");
  const grid = document.getElementById("relatedBooksGrid");
  const moreBtn = document.getElementById("relatedMoreBtn");

  if (!section || !grid || !currentBook) return;

  const currentId = Number(currentBook.id);

  if (reset || relatedBooksPoolBookId !== currentId) {
    relatedBooksVisibleCount = 4;
    buildRelatedBooksPool();
  }

  const visibleBooks = relatedBooksPool.slice(0, relatedBooksVisibleCount);

  section.classList.toggle("hidden", visibleBooks.length === 0);

  if (!visibleBooks.length) {
    grid.innerHTML = '<div class="comment-empty">Äang táº£i gá»£i Ã½ truyá»‡n...</div>';
    if (moreBtn) moreBtn.classList.add("hidden");
    loadRelatedBooksFromAPIFallback();
    return;
  }

  if (moreBtn) {
    moreBtn.classList.toggle("hidden", relatedBooksPool.length <= relatedBooksVisibleCount);
    moreBtn.textContent = "Xem thÃªm";
  }

  grid.innerHTML = visibleBooks.map((book) => {
    const tagsHtml = Array.isArray(book.tags)
      ? book.tags.slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")
      : "";

    return `
      <button class="related-book-card" type="button" data-related-book="${escapeHtml(book.id)}">
        <img src="${escapeHtml(assetUrl(book.cover || "images/default.jpg"))}" alt="BÃ¬a ${escapeHtml(book.title || "")}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/images/default.jpg'" />
        <strong>${escapeHtml(book.title || "KhÃ´ng cÃ³ tÃªn")}</strong>
        <small>${escapeHtml(book.author || "ChÆ°a rÃµ")} â€¢ ${getBookChapterCount(book)} chÆ°Æ¡ng</small>
        <span class="related-tags">${tagsHtml}</span>
      </button>
    `;
  }).join("");
}

function getSavedShelf() {
  return getStoredShelf(STORAGE_KEYS, safeParseJSON).map(Number).filter(Number.isFinite);
}

function setSavedShelf(shelf) {
  setStoredShelf(STORAGE_KEYS, shelf);
}

function isBookSaved(bookId) {
  return isStoredBookSaved(STORAGE_KEYS, safeParseJSON, bookId);
}

function saveToShelf(bookId) {
  saveStoredShelfItem(STORAGE_KEYS, safeParseJSON, bookId);
}

function removeFromShelf(bookId) {
  removeStoredShelfItem(STORAGE_KEYS, safeParseJSON, bookId);
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
  return getStoredReadingProgressMap(STORAGE_KEYS, safeParseJSON);
}

function setReadingProgressMap(progress) {
  setStoredReadingProgressMap(STORAGE_KEYS, progress);
}

function getReadingProgress(bookId) {
  return getStoredReadingProgress(STORAGE_KEYS, safeParseJSON, bookId);
}

function saveReadingProgress() {
  if (!currentBook) return;

  setStoredReadingProgress(STORAGE_KEYS, safeParseJSON, currentBook.id, currentChapterIndex);
}

function hasReadingProgress(bookId) {
  return String(bookId) in getReadingProgressMap();
}

function getProgressText(book) {
  const totalChapters = getBookChapterCount(book);
  if (!totalChapters) return "ChÆ°a cÃ³ chÆ°Æ¡ng";

  if (!hasReadingProgress(book.id)) {
    return `ChÆ°a Ä‘á»c â€¢ ${totalChapters} chÆ°Æ¡ng`;
  }

  const savedIndex = getReadingProgress(book.id);
  const currentChapter = Math.min(savedIndex + 1, totalChapters);
  return `Äang Ä‘á»c: ChÆ°Æ¡ng ${currentChapter}/${totalChapters}`;
}

function updateSaveShelfButton(bookId) {
  if (!saveShelfBtn) return;

  const saved = isBookSaved(bookId);
  const loginHint = isLoggedIn() ? "" : " (Ä‘Äƒng nháº­p Ä‘á»ƒ Ä‘á»“ng bá»™)";
  saveShelfBtn.textContent = saved ? "â™¥ ÄÃ£ lÆ°u vÃ o tá»§ sÃ¡ch" : `â™¡ LÆ°u truyá»‡n nÃ y${loginHint}`;
  saveShelfBtn.classList.toggle("saved", saved);
}

function updateBooksPanelTitle() {
  if (booksPanelTitle) {
    booksPanelTitle.textContent = showShelfOnly ? "Tá»§ sÃ¡ch cá»§a báº¡n" : "Kho truyá»‡n ná»•i báº­t";
    return;
  }

  const fallbackTitle = document.querySelector(".section-title.section-title-main");
  if (fallbackTitle) {
    fallbackTitle.textContent = showShelfOnly ? "Tá»§ sÃ¡ch cá»§a báº¡n" : "Kho truyá»‡n ná»•i báº­t";
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

function updateMetaTags(book) {
  // Update standard meta tags
  const description = book.desc || `Äá»c truyá»‡n "${book.title}" online miá»…n phÃ­`;
  const imageUrl = book.cover ? (book.cover.startsWith('http') ? book.cover : window.location.origin + '/' + book.cover) : window.location.origin + '/images/default.jpg';
  const bookUrl = window.location.href;
  const tags = Array.isArray(book.tags) ? book.tags.join(', ') : '';

  // Update description
  let descMeta = document.querySelector('meta[name="description"]');
  if (!descMeta) {
    descMeta = document.createElement('meta');
    descMeta.name = 'description';
    document.head.appendChild(descMeta);
  }
  descMeta.content = description;

  // Update keywords
  let keywordsMeta = document.querySelector('meta[name="keywords"]');
  if (!keywordsMeta) {
    keywordsMeta = document.createElement('meta');
    keywordsMeta.name = 'keywords';
    document.head.appendChild(keywordsMeta);
  }
  keywordsMeta.content = `${book.title}, ${book.author}, ${tags}, Ä‘á»c truyá»‡n online, TruyenFullvn`;

  // Update OG tags
  updateOrCreateMeta('property', 'og:title', `${book.title} | TruyenFullvn`);
  updateOrCreateMeta('property', 'og:description', description);
  updateOrCreateMeta('property', 'og:image', imageUrl);
  updateOrCreateMeta('property', 'og:url', bookUrl);
  updateOrCreateMeta('property', 'og:type', 'book');

  // Update Twitter tags
  updateOrCreateMeta('name', 'twitter:title', `${book.title} | TruyenFullvn`);
  updateOrCreateMeta('name', 'twitter:description', description);
  updateOrCreateMeta('name', 'twitter:image', imageUrl);
  updateOrCreateMeta('name', 'twitter:card', 'summary_large_image');

  // Update canonical
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = bookUrl;

  // Update structured data (JSON-LD)
  updateStructuredData(book, imageUrl);
}

function updateOrCreateMeta(attribute, value, content) {
  let meta = document.querySelector(`meta[${attribute}="${value}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, value);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function updateStructuredData(book, imageUrl) {
  let scriptTag = document.querySelector('script[type="application/ld+json"]');
  if (scriptTag) {
    scriptTag.remove();
  }

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Book",
    "name": book.title,
    "author": {
      "@type": "Person",
      "name": book.author || "ChÆ°a rÃµ"
    },
    "image": imageUrl,
    "description": book.desc || `Äá»c truyá»‡n "${book.title}" online miá»…n phÃ­`,
    "url": window.location.href,
    "inLanguage": "vi",
    "genre": Array.isArray(book.tags) ? book.tags : [],
    "numberOfPages": (Array.isArray(book.chapters) ? book.chapters.length : 0) * 10 // Æ¯á»›c tÃ­nh
  };

  scriptTag = document.createElement('script');
  scriptTag.type = 'application/ld+json';
  scriptTag.textContent = JSON.stringify(structuredData);
  document.head.appendChild(scriptTag);
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
    >${tag === "all" ? "Táº¥t cáº£" : escapeHtml(tag)}</button>
  `;

  const makeMobileButton = (tag, extra = false) => `
    <button
      class="mobile-subitem ${activeChip === tag ? "active" : ""} ${extra ? "category-extra" : ""}" ${extra ? "hidden" : ""}
      type="button"
      data-mobile-chip="${escapeHtml(tag)}"
    >${tag === "all" ? "Táº¥t cáº£" : escapeHtml(tag)}</button>
  `;

  const makeSidebarItem = (tag, extra = false) => `
    <li class="${extra ? "category-extra" : ""}" ${extra ? "hidden" : ""}>
      <a href="#" class="${activeChip === tag ? "active" : ""}" data-chip="${escapeHtml(tag)}">${tag === "all" ? "Táº¥t cáº£" : escapeHtml(tag)}</a>
    </li>
  `;

  if (chipGroup) {
    chipGroup.innerHTML = `
      ${makeChipButton("all")}
      ${firstTags.map((tag) => makeChipButton(tag)).join("")}
      ${restTags.map((tag) => makeChipButton(tag, true)).join("")}
      ${hasMore ? '<button class="chip-btn category-toggle" type="button" data-category-toggle>ThÃªm thá»ƒ loáº¡i â–¾</button>' : ""}
    `;
  }

  const menuList = document.querySelector(".menu-list");
  if (menuList) {
    menuList.innerHTML = `
      ${makeSidebarItem("all")}
      ${firstTags.map((tag) => makeSidebarItem(tag)).join("")}
      ${restTags.map((tag) => makeSidebarItem(tag, true)).join("")}
      ${hasMore ? '<li><button class="category-sidebar-toggle" type="button" data-category-toggle>ThÃªm thá»ƒ loáº¡i â–¾</button></li>' : ""}
    `;
  }

  if (mobileCategoryMenu) {
    mobileCategoryMenu.innerHTML = `
      ${makeMobileButton("all")}
      ${firstTags.map((tag) => makeMobileButton(tag)).join("")}
      ${restTags.map((tag) => makeMobileButton(tag, true)).join("")}
      ${hasMore ? '<button class="mobile-subitem category-toggle" type="button" data-category-toggle>ThÃªm thá»ƒ loáº¡i â–¾</button>' : ""}
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
      toggle.textContent = "ThÃªm thá»ƒ loáº¡i â–¾";
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

  toggleButton.textContent = isOpen ? "Thu gá»n â–´" : "ThÃªm thá»ƒ loáº¡i â–¾";
}

function updateCategoryActiveState() {
  document.querySelectorAll("[data-chip]").forEach((el) => {
    el.classList.toggle("active", el.dataset.chip === activeChip);
  });

  document.querySelectorAll("[data-mobile-chip]").forEach((el) => {
    el.classList.toggle("active", el.dataset.mobileChip === activeChip);
  });
}


async function searchBooksFromAPI(keyword, limit = 80) {
  const q = String(keyword || "").trim();

  if (!q) {
    searchModeActive = false;
    searchResults = [];
    currentPage = 1;
    renderBooks();
    return;
  }

  try {
    if (booksGrid) {
      booksGrid.innerHTML = '<div class="empty-state">Äang tÃ¬m truyá»‡n...</div>';
    }

    if (searchFetchController) {
      searchFetchController.abort();
    }

    searchFetchController = new AbortController();

    const res = await fetch(apiUrl(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`), {
      cache: "no-store",
      signal: searchFetchController.signal
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      throw new Error("Search API khÃ´ng tráº£ vá» máº£ng");
    }

    searchResults = data.map((book, index) =>
      normalizeBook(
        {
          ...book,
          chapterCount: book.chapter_count,
          seoUrl: book.seo_url,
          chapters: []
        },
        {
          id: Number(book?.id ?? index + 1),
          chapterCount: Number(book?.chapterCount ?? book?.chapter_count ?? 0),
          seoUrl: book?.seoUrl || book?.seo_url || `book-${Number(book?.id ?? index + 1)}`
        }
      )
    );

    searchModeActive = true;
    showShelfOnly = false;
    activeChip = "all";
    currentPage = 1;

    updateCategoryActiveState();
    renderBooks();

    if (isMobileView()) {
      closeMobilePanels();
      updateMobileToggleState();
    }
  } catch (err) {
    if (err.name === "AbortError") return;

    console.warn("KhÃ´ng táº£i Ä‘Æ°á»£c Search API, dÃ¹ng tÃ¬m kiáº¿m local:", err);
    searchModeActive = false;
    searchResults = [];
    currentPage = 1;
    renderBooks();
  }
}

function clearSearchModeIfNeeded() {
  const keyword = searchInput?.value?.trim() || "";
  if (keyword) return;

  searchModeActive = false;
  searchResults = [];
  currentPage = 1;
  renderContinueReadingPanel();
  renderBooks();
}

function handleSearchInputDebounced() {
  clearTimeout(searchDebounceTimer);

  searchDebounceTimer = setTimeout(() => {
    const keyword = searchInput?.value?.trim() || "";

    if (!keyword) {
      clearSearchModeIfNeeded();
      return;
    }

    searchBooksFromAPI(keyword);
  }, 350);
}

async function handleSearchSubmit() {
  clearTimeout(searchDebounceTimer);

  const keyword = searchInput?.value?.trim() || "";

  if (!keyword) {
    clearSearchModeIfNeeded();
    return;
  }

  await searchBooksFromAPI(keyword);
}


function getFilteredBooks() {
  let filtered = searchModeActive ? [...searchResults] : [...books];

  if (showShelfOnly) {
    const shelf = getSavedShelf();
    filtered = filtered.filter((book) => shelf.includes(Number(book.id)));
  }

  const keyword = searchInput?.value?.trim().toLowerCase() || "";
  const authorKeyword = authorFilter?.value?.trim().toLowerCase() || "";
  const sortValue = sortSelect?.value || "popular";

  if (keyword && !searchModeActive) {
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
  } else if (sortValue === "random") {
    filtered.sort(() => Math.random() - 0.5);  // Random order
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

  // << vá» trang Ä‘áº§u
  addBtn("<<", 1, currentPage === 1);

  // < trang trÆ°á»›c
  addBtn("<", currentPage - 1, currentPage === 1);

  // chá»‰ hiá»‡n tá»‘i Ä‘a 4 trang gáº§n currentPage
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

  // >> tá»›i trang cuá»‘i
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
      ? '<div class="empty-state">Tá»§ sÃ¡ch cá»§a báº¡n Ä‘ang trá»‘ng. HÃ£y lÆ°u vÃ i truyá»‡n báº¡n thÃ­ch nhÃ©.</div>'
      : '<div class="empty-state">KhÃ´ng tÃ¬m tháº¥y truyá»‡n phÃ¹ há»£p.</div>';

    if (pagination) pagination.innerHTML = "";
    return;
  }

  pageItems.forEach((book) => {
    const isSaved = isBookSaved(book.id);
    const saveText = isSaved ? "ÄÃ£ lÆ°u" : "LÆ°u";
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
        src="${escapeHtml(assetUrl(book.cover || "images/default.jpg"))}"
        alt="BÃ¬a ${escapeHtml(book.title || "")}"
        loading="lazy"
        decoding="async"
        onerror="this.onerror=null;this.src='/images/default.jpg'"
      />
      <div class="book-body">
        <div class="book-title">${escapeHtml(book.title || "KhÃ´ng cÃ³ tÃªn")}</div>
        <div class="book-meta">
          TÃ¡c giáº£: ${escapeHtml(book.author || "ChÆ°a rÃµ")} â€¢ ${totalChapters} chÆ°Æ¡ng
        </div>
        <div class="tags">${tagsHtml}</div>
        <div class="book-desc">${escapeHtml(book.desc || "")}</div>
        <div class="reading-progress">${escapeHtml(progressText)}</div>
        <div class="book-actions">
          <button class="read-btn" type="button" data-id="${book.id}">Äá»c ngay</button>
          ${
            showContinueBtn
              ? `<button class="continue-btn" type="button" data-continue="${book.id}">
                   Äá»c tiáº¿p ${continueChapter}
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


function getChapterMediaUrl(chapter, type = "audio") {
  if (!chapter || typeof chapter !== "object") return "";

  const keys = type === "video"
    ? ["video", "videoUrl", "video_url", "mediaVideo", "media_video"]
    : ["audio", "audioUrl", "audio_url", "mediaAudio", "media_audio"];

  for (const key of keys) {
    const value = chapter[key];
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      return type === "audio" ? normalizeAudioUrl(trimmed) : trimmed;
    }
  }

  return "";
}

function getChapterMediaHtml(chapter, chapterTitle) {
  const audioUrl = getChapterMediaUrl(chapter, "audio");
  const mediaTitle = `${currentBook?.title || "Truyá»‡n"} â€¢ ${chapterTitle}`;
  const note = audioUrl ? "" : "Audio Ä‘ang trong quÃ¡ trÃ¬nh xá»­ lÃ½";
  const badge = audioUrl ? "Audio" : "Demo audio";
  const audioSrc = audioUrl ? ` src="${escapeHtml(audioUrl)}"` : "";

  return `
    <section class="chapter-media ${audioUrl ? "has-media" : "is-demo"}" id="chapterMedia">
      <div class="chapter-media-head">
        <div>
          <div class="chapter-media-kicker">ðŸŽ§ Nghe audio</div>
          <div class="chapter-media-title" id="chapterMediaTitle">${escapeHtml(mediaTitle)}</div>
        </div>
        <span class="chapter-media-badge" id="chapterMediaBadge">${badge}</span>
      </div>
      <audio id="chapterAudio" class="chapter-audio" controls preload="metadata"${audioSrc}></audio>
      <div class="audio-tools">
          <label>
            Tá»‘c Ä‘á»™ nghe
            <select id="audioSpeedSelect">
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </label>
      </div>
      <div class="chapter-media-note" id="chapterMediaNote">${escapeHtml(note)}</div>
    </section>
  `;
}

function scrollToChapterMedia() {
  const media = document.getElementById("chapterMedia");
  if (!media) return;

  media.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function renderChapterChips() {
  if (!currentBook || !chapterList) return;

  const chapters = Array.isArray(currentBook.chapters) ? currentBook.chapters : [];
  chapterList.innerHTML = "";

  const chapter = chapters[currentChapterIndex];
  if (!chapter) return;

  const chip = document.createElement("span");
  chip.className = "chapter-chip active";
  chip.textContent = chapter.title || `ChÆ°Æ¡ng ${currentChapterIndex + 1}`;
  chapterList.appendChild(chip);

  const listenBtn = document.createElement("button");
  listenBtn.className = "listen-chapter-btn";
  listenBtn.type = "button";
  listenBtn.textContent = "ðŸŽ§ Nghe truyá»‡n";
  listenBtn.setAttribute("aria-label", "Chuyá»ƒn xuá»‘ng trÃ¬nh phÃ¡t audio cá»§a chÆ°Æ¡ng hiá»‡n táº¡i");
  listenBtn.addEventListener("click", scrollToChapterMedia);
  chapterList.appendChild(listenBtn);
}

function renderChapterSelect() {
  if (!currentBook || !chapterSelect) return;

  const chapters = Array.isArray(currentBook.chapters) ? currentBook.chapters : [];
  chapterSelect.innerHTML = "";

  chapters.forEach((chapter, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = chapter?.title || `ChÆ°Æ¡ng ${index + 1}`;
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
    readerMeta.textContent = `${book.author || "ChÆ°a rÃµ"} â€¢ ChÆ°a cÃ³ chÆ°Æ¡ng`;
  }

  if (readerBody) {
    readerBody.innerHTML = "<p>Truyá»‡n nÃ y hiá»‡n chÆ°a cÃ³ chÆ°Æ¡ng nÃ o.</p>";
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



async function hydrateServerRenderedChapter() {
  const page = window.TRUYENFULLVN_PAGE;

  if (!page || page.mode !== "chapter" || !page.bookId) {
    return false;
  }

  const bookId = Number(page.bookId);
  const chapterNumber = Number(page.chapterNumber || 1);

  if (!Number.isFinite(bookId)) {
    return false;
  }

  let bookSummary = books.find((item) => Number(item.id) === bookId);

  if (!bookSummary) {
    bookSummary = {
      id: bookId,
      title: readerTitle?.textContent?.trim() || `Truyá»‡n #${bookId}`,
      author: (readerAuthor?.textContent || "").replace(/^TÃ¡c giáº£:\s*/i, "").trim(),
      tags: Array.from(document.querySelectorAll("#readerTags .tag")).map((el) => el.textContent.trim()).filter(Boolean),
      desc: readerDesc?.textContent?.trim() || "",
      cover: readerCover?.getAttribute("src") || "images/default.jpg",
      seoUrl: page.seoUrl || `book-${bookId}`,
      chapterCount: 0,
      chapters: []
    };

    books.push(bookSummary);
  }

  try {
    const fullBookData = await fetchBookDetail(bookSummary);
    currentBook = normalizeBook(fullBookData, bookSummary);
  } catch (err) {
    console.warn("SSR hydrate: khÃ´ng táº£i Ä‘Æ°á»£c full book, dÃ¹ng dá»¯ liá»‡u HTML hiá»‡n cÃ³:", err);
    currentBook = normalizeBook(bookSummary, bookSummary);
  }

  currentChapterIndex = Math.max(0, chapterNumber - 1);

  // Giá»¯ ná»™i dung SEO Ä‘Ã£ render tá»« backend, chá»‰ hydrate UI Ä‘á»™ng.
  if (readerView) {
    readerView.classList.remove("hidden");
    readerView.classList.add("active");
  }

  if (homeView) {
    homeView.classList.add("hidden");
  }

  if (readerTitle && currentBook?.title) {
    readerTitle.textContent = currentBook.title;
  }

  if (readerAuthor && currentBook?.author) {
    readerAuthor.textContent = `TÃ¡c giáº£: ${currentBook.author || "ChÆ°a rÃµ"}`;
  }

  if (readerTags && Array.isArray(currentBook?.tags)) {
    readerTags.innerHTML = currentBook.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  }

  if (readerDesc && currentBook?.desc) {
    readerDesc.textContent = currentBook.desc;
  }

  if (readerCover && currentBook?.cover) {
    readerCover.src = currentBook.cover.startsWith("/") ? currentBook.cover : `/${currentBook.cover}`.replace("//", "/");
  }

  saveReadingProgress();

  if (currentBook) {
    saveRemoteReadingProgressDebounced(currentBook.id, currentChapterIndex + 1);
  }

  updateSaveShelfButton(currentBook?.id);
  updateAuthUI();
  updateCommentLoginState();
  setupChapterAudioPlayer();
  loadBookComments();

  const relatedSection = document.getElementById("relatedBooksSection");
  if (relatedSection) {
    relatedSection.classList.remove("hidden");
  }

  renderRelatedBooks(true);

  setTimeout(async () => {
    renderRelatedBooks(false);

    const grid = document.getElementById("relatedBooksGrid");

    if (grid && !grid.children.length) {
      await loadRelatedBooksFromAPIFallback();
    }
  }, 250);

  return true;
}


function refreshReaderSidePanels() {
  updateAuthUI();
  updateCommentLoginState();

  if (currentBook) {
    renderRelatedBooks(true);
    setTimeout(() => renderRelatedBooks(false), 120);
  }
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
    readerMeta.textContent = `${currentBook.author || "ChÆ°a rÃµ"} â€¢ ChÆ°Æ¡ng khÃ´ng há»£p lá»‡`;
    readerBody.innerHTML = "<p>ChÆ°Æ¡ng nÃ y bá»‹ lá»—i dá»¯ liá»‡u.</p>" + getChapterMediaHtml({}, "ChÆ°Æ¡ng lá»—i");

    renderChapterChips();
    renderChapterSelect();

    if (prevChapterBtn) prevChapterBtn.disabled = currentChapterIndex === 0;
    if (nextChapterBtn) nextChapterBtn.disabled = currentChapterIndex >= chapters.length - 1;
    return;
  }

  const chapterTitle = chapter.title || `ChÆ°Æ¡ng ${currentChapterIndex + 1}`;
  readerMeta.textContent = `${currentBook.author || "ChÆ°a rÃµ"} â€¢ ${chapterTitle}`;

  const contentArray = Array.isArray(chapter.content)
    ? chapter.content
        .map((p) => String(p ?? "").trim())
        .filter((p) => p !== "")
    : [];

  const contentHtml = contentArray.length
    ? contentArray.map((p) => `<p>${escapeHtml(p)}</p>`).join("")
    : "<p>ChÆ°Æ¡ng nÃ y chÆ°a cÃ³ ná»™i dung.</p>";

  readerBody.innerHTML = contentHtml + getChapterMediaHtml(chapter, chapterTitle);
  setupChapterAudioPlayer();

  renderChapterChips();
  renderChapterSelect();

  if (prevChapterBtn) {
    prevChapterBtn.disabled = currentChapterIndex === 0;
  }

  if (nextChapterBtn) {
    nextChapterBtn.disabled = currentChapterIndex >= chapters.length - 1;
  }

  saveReadingProgress();
  renderContinueReadingPanel();

  if (currentBook) {
    saveRemoteReadingProgressDebounced(
      currentBook.id,
      currentChapterIndex + 1
    );
  }

  refreshReaderSidePanels();

  updateRouteForCurrentChapter();
  lastScrollY = 0;
  window.scrollTo({ top: 0, behavior: "smooth" });
  handleMobileTopbarScroll();
}


async function fetchBookDetail(bookSummary, signal) {
  const cached = getBookDetailCache(bookSummary.id);
  if (cached) {
    return cached;
  }

  const apiPath = apiUrl(`/api/books/${bookSummary.id}`);

  try {
    const res = await fetch(apiPath, { signal, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`API HTTP ${res.status}`);
    }

    const data = await res.json();
    setBookDetailCache(bookSummary.id, data);
    return data;
  } catch (apiError) {
    // Fallback giá»¯ web cÅ© váº«n cháº¡y náº¿u backend local chÆ°a báº­t.
    if (!bookSummary.file) throw apiError;

    console.warn("KhÃ´ng táº£i Ä‘Æ°á»£c tá»« API, fallback sang JSON tÄ©nh:", apiError);
    const fallbackRes = await fetch(bookSummary.file, { signal, cache: "force-cache" });
    if (!fallbackRes.ok) {
      throw new Error(`JSON HTTP ${fallbackRes.status}`);
    }

    const data = await fallbackRes.json();
    setBookDetailCache(bookSummary.id, data);
    return data;
  }
}

async function openReader(bookId, chapterIndex = null) {
  const bookSummary = books.find((item) => Number(item.id) === Number(bookId));
  if (!bookSummary) return;

  if (currentFetchController) {
    currentFetchController.abort();
  }
  currentFetchController = new AbortController();
  const { signal } = currentFetchController;

  try {
    if (readerBody) {
      readerBody.innerHTML = '<div class="empty-state">Äang táº£i truyá»‡n...</div>';
    }

    const fullBookData = await fetchBookDetail(bookSummary, signal);
    const fullBook = normalizeBook(fullBookData, bookSummary);
    currentBook = fullBook;

    if (readerTitle) {
      readerTitle.textContent = fullBook.title || "KhÃ´ng cÃ³ tÃªn";
    }

    document.title = `${fullBook.title || "KhÃ´ng cÃ³ tÃªn"} | TruyenFullvn`;

    // Update meta tags for SEO
    updateMetaTags(fullBook);

    if (readerCover) {
      readerCover.onerror = null;
      readerCover.src = fullBook.cover || "images/default.jpg";
      readerCover.alt = `BÃ¬a ${fullBook.title || ""}`;
      readerCover.loading = "lazy";
      readerCover.decoding = "async";
      readerCover.onerror = () => {
        readerCover.onerror = null;
        readerCover.src = "images/default.jpg";
      };
    }

    if (readerAuthor) {
      readerAuthor.textContent = `TÃ¡c giáº£: ${fullBook.author || "ChÆ°a rÃµ"}`;
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
    if (error.name === "AbortError") return;
    console.error("KhÃ´ng táº£i Ä‘Æ°á»£c file truyá»‡n:", error);
    alert("KhÃ´ng má»Ÿ Ä‘Æ°á»£c truyá»‡n nÃ y.");
  }
}

function backHome() {
  document.title = "TruyenFullvn - Äá»c truyá»‡n online miá»…n phÃ­";
  clearBookRoute();
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
  searchModeActive = false;
  searchResults = [];
  if (authorFilter) authorFilter.value = "";
  if (sortSelect) sortSelect.value = "random";  // Default to random

  updateCategoryActiveState();
}

function goHome(e) {
  if (e) e.preventDefault();
  closeMobilePanels();
  updateMobileToggleState();
  resetToHomeMode();
  resetHomeMetaTags();
  backHome();
  renderBooks();
}

function resetHomeMetaTags() {
  document.title = "TruyenFullvn - Äá»c truyá»‡n online miá»…n phÃ­";

  updateOrCreateMeta('name', 'description', 'TruyenFullvn lÃ  kho truyá»‡n online miá»…n phÃ­, Ä‘á»c truyá»‡n ngÃ´n tÃ¬nh, hiá»‡n Ä‘áº¡i, cá»• Ä‘áº¡i, xuyÃªn khÃ´ng, sá»§ng vÃ  chá»¯a lÃ nh Ä‘Æ°á»£c cáº­p nháº­t nhanh.');
  updateOrCreateMeta('name', 'keywords', 'TruyenFullvn, Ä‘á»c truyá»‡n online, truyá»‡n ngÃ´n tÃ¬nh, truyá»‡n hiá»‡n Ä‘áº¡i, truyá»‡n cá»• Ä‘áº¡i, truyá»‡n xuyÃªn khÃ´ng, truyá»‡n miá»…n phÃ­');

  updateOrCreateMeta('property', 'og:title', 'TruyenFullvn - Äá»c truyá»‡n online miá»…n phÃ­');
  updateOrCreateMeta('property', 'og:description', 'Kho truyá»‡n online miá»…n phÃ­, nhiá»u thá»ƒ loáº¡i háº¥p dáº«n, giao diá»‡n Ä‘á»c thoáº£i mÃ¡i trÃªn Ä‘iá»‡n thoáº¡i vÃ  mÃ¡y tÃ­nh.');
  updateOrCreateMeta('property', 'og:url', 'https://truyenfullvn.org/');
  updateOrCreateMeta('property', 'og:image', 'https://truyenfullvn.org/images/default.jpg');
  updateOrCreateMeta('property', 'og:type', 'website');

  updateOrCreateMeta('name', 'twitter:title', 'TruyenFullvn - Äá»c truyá»‡n online miá»…n phÃ­');
  updateOrCreateMeta('name', 'twitter:description', 'Kho truyá»‡n online miá»…n phÃ­, nhiá»u thá»ƒ loáº¡i háº¥p dáº«n, cáº­p nháº­t nhanh.');
  updateOrCreateMeta('name', 'twitter:image', 'https://truyenfullvn.org/images/default.jpg');
  updateOrCreateMeta('name', 'twitter:card', 'summary_large_image');

  // Remove structured data script
  let scriptTag = document.querySelector('script[type="application/ld+json"]');
  if (scriptTag) {
    scriptTag.remove();
  }
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
  searchModeActive = false;
  searchResults = [];
  if (searchInput) searchInput.value = "";
  currentPage = 1;
  activeChip = "all";
  updateCategoryActiveState();

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
  searchModeActive = false;
  searchResults = [];
  if (searchInput) searchInput.value = "";
  currentPage = 1;

  updateCategoryActiveState();

  renderBooks();
}




function openBookFromList(bookId) {
  goToBook(bookId, 0);
}

function goToBook(bookId, chapterIndex = 0) {
  const id = Number(bookId);
  if (!Number.isFinite(id) || id <= 0) return;

  const book = books.find((b) => Number(b.id) === id);
  if (!book || !book.seoUrl) return;

  const safeChapter = chapterIndex >= 0 ? Number(chapterIndex) : 0;
  const newPath = `/truyen/${book.seoUrl}/chuong-${safeChapter + 1}`;

  if (window.location.pathname !== newPath) {
    history.pushState(null, "", newPath);
  }
  handleRoute();
}


function showHomeWithoutRouteChange() {
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


function clearBookRoute() {
  if (/^\/truyen\/[^/]+\/chuong-\d+/.test(window.location.pathname)) {
    history.pushState(null, "", "/");
  }
}

function parseBookRoute() {
  const path = window.location.pathname.replace(/\/$/, "");
  const match = path.match(/^\/truyen\/(.+)\/chuong-(\d+)$/);
  if (!match) return null;

  const seoUrl = match[1];
  const chapterNumber = Number(match[2]);
  const book = books.find((b) => b.seoUrl === seoUrl);
  if (!book) return null;

  return {
    bookId: book.id,
    chapterIndex: Math.max(0, chapterNumber - 1)
  };
}


function getRouteTargetFromLocation() {
  const hash = window.location.hash || "";
  const path = window.location.pathname || "";

  // Hash route: #book-123-4
  const hashMatch = hash.match(/book-(\d+)(?:-(\d+))?/i);
  if (hashMatch) {
    return {
      bookId: Number(hashMatch[1]),
      chapterIndex: Math.max(0, Number(hashMatch[2] || 1) - 1)
    };
  }

  // Pretty route examples:
  // /truyen/book-123/chuong-4/
  // /truyen/book-123/
  const prettyMatch = path.match(/\/truyen\/(?:[^/]*?book-)?(\d+)(?:\/chuong-(\d+))?/i);
  if (prettyMatch) {
    return {
      bookId: Number(prettyMatch[1]),
      chapterIndex: Math.max(0, Number(prettyMatch[2] || 1) - 1)
    };
  }

  // Fallback route: /book-123/chuong-4/
  const simpleMatch = path.match(/\/book-(\d+)(?:\/chuong-(\d+))?/i);
  if (simpleMatch) {
    return {
      bookId: Number(simpleMatch[1]),
      chapterIndex: Math.max(0, Number(simpleMatch[2] || 1) - 1)
    };
  }

  return null;
}

async function openRouteFromCurrentUrl() {
  const target = getRouteTargetFromLocation();

  if (!target || !Number.isFinite(target.bookId)) {
    return false;
  }

  if (!Array.isArray(books) || !books.length) {
    return false;
  }

  await openReader(target.bookId, target.chapterIndex);
  refreshReaderSidePanels();
  return true;
}


async function handleRoute() {
  const opened = await openRouteFromCurrentUrl();

  if (opened) {
    return;
  }

  // KhÃ´ng cÃ³ route truyá»‡n thÃ¬ giá»¯ trang chá»§.
  if (readerView && readerView.classList.contains("active")) {
    backHome();
  }
}


function updateRouteForCurrentChapter() {
  if (!currentBook || !currentBook.seoUrl) return;
  const newPath = `/truyen/${currentBook.seoUrl}/chuong-${currentChapterIndex + 1}`;
  if (window.location.pathname !== newPath) {
    history.replaceState(null, "", newPath);
  }
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
    featuredCover.alt = `BÃ¬a ${featuredBook.title || "truyá»‡n Ä‘á» cá»­"}`;
    featuredCover.loading = "lazy";
    featuredCover.decoding = "async";
    featuredCover.onerror = () => {
      featuredCover.onerror = null;
      featuredCover.src = "images/default.jpg";
    };
  }

  if (featuredTitle) {
    featuredTitle.textContent = featuredBook.title || "Truyá»‡n Ä‘á» cá»­ hÃ´m nay";
  }

  if (featuredDesc) {
    featuredDesc.textContent =
      featuredBook.desc ||
      (Array.isArray(featuredBook.tags) && featuredBook.tags.length
        ? `Thá»ƒ loáº¡i: ${featuredBook.tags.join(", ")}`
        : "Má»™t cÃ¢u chuyá»‡n ngáº«u nhiÃªn Ä‘ang chá» báº¡n khÃ¡m phÃ¡.");
  }
}

function openFeaturedBook() {
  // Always render new random featured book
  renderFeaturedBook();

  if (featuredBookId) {
    openBookFromList(featuredBookId);
  }
}



async function fetchRankingBooks(limit = 5) {
  try {
    const res = await fetchTrendingBooks(limit);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (Array.isArray(data) && data.length) {
      return data.map((book) =>
        normalizeBook(
          {
            ...book,
            chapterCount: book.chapter_count,
            seoUrl: book.seo_url,
            chapters: []
          },
          book
        )
      );
    }
  } catch (err) {
    console.warn("KhÃ´ng táº£i Ä‘Æ°á»£c ranking API, dÃ¹ng ranking local:", err);
  }

  const validBooks = books.filter((book) => Number(book.id));
  return [...validBooks]
    .sort((a, b) => (b.views || 0) - (a.views || 0) || (b.popularity || 0) - (a.popularity || 0))
    .slice(0, limit);
}


async function renderRandomRankings() {
  const rankingBooks = await fetchRankingBooks(5);

  if (rankingList) {
    rankingList.innerHTML = rankingBooks
      .map((book) => `
        <li data-book-id="${escapeHtml(book.id)}">${escapeHtml(book.title || "KhÃ´ng cÃ³ tÃªn")}</li>
      `)
      .join("");
  }

  if (mobileRankingMenu) {
    mobileRankingMenu.innerHTML = rankingBooks
      .map((book) => `
        <button class="mobile-subitem" type="button" data-ranking-book="${escapeHtml(book.id)}">
          ${escapeHtml(book.title || "KhÃ´ng cÃ³ tÃªn")}
        </button>
      `)
      .join("");
  }
}


async function loadBooks() {
  try {
    if (!booksGrid) return;

    showBooksSkeleton();

    let data = [];
    let loadedFromApi = false;

    const cachedBooks = getCachedBooksIndex();
    if (cachedBooks) {
      data = cachedBooks;
      console.log(`ÄÃ£ táº£i ${data.length} truyá»‡n tá»« cache local`);
    }

    // Æ¯u tiÃªn nguá»“n má»›i: FastAPI + PostgreSQL
    try {
      if (!data.length) {
      const apiRes = await fetch(apiUrl("/api/books?skip=0&limit=10000"), {
        cache: "no-store"
      });

      if (apiRes.ok) {
        const apiData = await apiRes.json();
        if (Array.isArray(apiData)) {
          data = apiData;
          loadedFromApi = true;
          console.log(`ÄÃ£ táº£i ${data.length} truyá»‡n tá»« FastAPI`);
        }
      } else {
        console.warn(`API /api/books tráº£ HTTP ${apiRes.status}`);
      }
      }
    } catch (apiError) {
      console.warn("KhÃ´ng káº¿t ná»‘i Ä‘Æ°á»£c FastAPI, fallback sang JSON tÄ©nh:", apiError);
    }

    // Fallback: giá»¯ cÆ¡ cháº¿ cÅ© Ä‘á»c books-index-1.json...books-index-10.json
    if (!loadedFromApi && !data.length) {
      let loadedFromChunks = false;

      for (let i = 1; i <= 10; i++) {
        try {
          const chunkPath = `books-index-${i}.json`;
          const res = await fetch(chunkPath, { cache: "no-store" });

          if (res.ok) {
            const chunkData = await res.json();
            if (Array.isArray(chunkData)) {
              data.push(...chunkData);
              loadedFromChunks = true;
            }
          } else {
            break;
          }
        } catch (err) {
          if (i === 1) break;
        }
      }

      if (!loadedFromChunks) {
        const booksIndexPaths = ["books-index-seo.json", "data/books-index.json", "books-index.json"];
        let res = null;
        let lastError = null;

        for (const path of booksIndexPaths) {
          try {
            const currentRes = await fetch(path, { cache: "no-store" });
            if (currentRes.ok) {
              res = currentRes;
              break;
            }
            lastError = new Error(`${path} â†’ HTTP ${currentRes.status}`);
          } catch (err) {
            lastError = err;
          }
        }

        if (!res) {
          throw lastError || new Error("KhÃ´ng tÃ¬m tháº¥y books-index");
        }

        data = await res.json();
      }
    }

    if (!Array.isArray(data)) {
      throw new Error("Nguá»“n dá»¯ liá»‡u truyá»‡n khÃ´ng pháº£i máº£ng");
    }

    setCachedBooksIndex(data);

    books = data.map((book, index) =>
      normalizeBook(
        {
          ...book,
          chapters: []
        },
        {
          id: Number(book?.id ?? index + 1),
          chapterCount: Number(book?.chapterCount ?? book?.chapter_count ?? 0),
          seoUrl: book?.seoUrl || book?.seo_url || `book-${Number(book?.id ?? index + 1)}`
        }
      )
    );

    renderCategoryControls();
    collapseCategoryExtrasByDefault();

    featuredBookId = null;
    renderFeaturedBook();

    await renderRandomRankings();
    appReady = true;
    renderContinueReadingPanel();
    renderBooks();
    await openRouteFromCurrentUrl();
    await hydrateServerRenderedChapter();
  } catch (error) {
    console.error("KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u truyá»‡n:", error);

    if (booksGrid) {
      booksGrid.innerHTML =
        '<div class="empty-state">KhÃ´ng táº£i Ä‘Æ°á»£c dá»¯ liá»‡u truyá»‡n. HÃ£y kiá»ƒm tra backend FastAPI hoáº·c cháº¡y web báº±ng local server.</div>';
    }

    if (pagination) {
      pagination.innerHTML = "";
    }
  }
}


function bindEvents() {

  if (continueToggleBtn) {
    continueToggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      continueExpanded = !continueExpanded;
      renderContinueReadingPanel();
    });
  }

  if (continueRefreshBtn) {
    continueRefreshBtn.addEventListener("click", refreshContinueReadingPanel);
  }

  if (continueReadingGrid) {
    continueReadingGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-continue-book]");
      if (!btn) return;

      e.preventDefault();
      goToBook(btn.dataset.continueBook, Number(btn.dataset.continueChapter || 0));
    });
  }

  if (relatedMoreBtn) {
    relatedMoreBtn.addEventListener("click", (e) => {
      e.preventDefault();
      relatedBooksVisibleCount += 4;
      renderRelatedBooks(false);
    });
  }

  if (relatedBooksGrid) {
    relatedBooksGrid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-related-book]");
      if (!btn) return;

      e.preventDefault();
      goToBook(btn.dataset.relatedBook, 0);
    });
  }



  if (loginLink) {
    loginLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (isLoggedIn()) {
        openAccountModal(e);
      } else {
        openAuthModal(e);
      }
    });
  }

  if (logoutLink) {
    logoutLink.addEventListener("click", logoutUser);
  }

  if (authCloseBtn) {
    authCloseBtn.addEventListener("click", closeAuthModal);
  }

  if (authModal) {
    authModal.addEventListener("click", (e) => {
      if (e.target === authModal) {
        closeAuthModal(e);
      }
    });
  }

  if (authModeLoginBtn) {
    authModeLoginBtn.addEventListener("click", () => setAuthMode("login"));
  }

  if (authModeRegisterBtn) {
    authModeRegisterBtn.addEventListener("click", () => setAuthMode("register"));
  }

  if (authBackLoginBtn) {
    authBackLoginBtn.addEventListener("click", () => setAuthMode("login"));
  }

  if (authLoginBtn) {
    authLoginBtn.addEventListener("click", () => authRequest("/api/login"));
  }

  if (authRegisterBtn) {
    authRegisterBtn.addEventListener("click", () => authRequest("/api/register"));
  }

  if (authPassword) {
    authPassword.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        authRequest(authMode === "register" ? "/api/register" : "/api/login");
      }
    });
  }

  if (authPasswordConfirm) {
    authPasswordConfirm.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        authRequest("/api/register");
      }
    });
  }


  if (accountCloseBtn) {
    accountCloseBtn.addEventListener("click", closeAccountModal);
  }

  if (accountLogoutBtn) {
    accountLogoutBtn.addEventListener("click", (e) => {
      closeAccountModal(e);
      logoutUser(e);
    });
  }

  if (accountModal) {
    accountModal.addEventListener("click", (e) => {
      if (e.target === accountModal) {
        closeAccountModal(e);
      }
    });

    accountModal.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const tabBtn = target.closest("[data-account-tab]");
      if (tabBtn) {
        e.preventDefault();
        setAccountTab(tabBtn.dataset.accountTab);
        return;
      }

      const bookBtn = target.closest("[data-account-book]");
      if (bookBtn) {
        e.preventDefault();
        const bookId = bookBtn.dataset.accountBook;
        const chapterIndex = Number(bookBtn.dataset.accountChapter || 0);
        closeAccountModal();
        goToBook(bookId, chapterIndex);
      }
    });
  }

  if (commentsRefreshBtn) {
    commentsRefreshBtn.addEventListener("click", loadBookComments);
  }

  if (commentSubmitBtn) {
    commentSubmitBtn.addEventListener("click", submitBookComment);
  }

  if (commentInput) {
    commentInput.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        submitBookComment();
      }
    });
  }

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const toggleBtn = target.closest("[data-category-toggle]");
    if (toggleBtn) {
      e.preventDefault();
      toggleCategoryList(toggleBtn);
    }
  });


  if (rankingList) {
    rankingList.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const item = target.closest("[data-book-id]");
      if (!item) return;

      e.preventDefault();
      openBookFromList(item.dataset.bookId);
    });
  }

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
        openBookFromList(rankingBook);
      }
    });
  }

  if (booksGrid) {
    booksGrid.addEventListener("click", async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const readId = target.getAttribute("data-id");
      const continueId = target.getAttribute("data-continue");
      const saveId = target.getAttribute("data-save");

      if (readId) {
        openBookFromList(readId);
        return;
      }

      if (continueId) {
        goToBook(continueId, getReadingProgress(continueId));
        return;
      }

      if (saveId) {
        e.stopPropagation();

        const book = books.find((item) => Number(item.id) === Number(saveId));
        if (!book) return;

        const saved = await toggleShelfSmart(book.id, getReadingProgress(book.id) + 1);

        if (currentBook && Number(currentBook.id) === Number(book.id)) {
          updateSaveShelfButton(book.id);
        }

        renderBooks();
        if (accountModal && !accountModal.classList.contains('hidden')) renderAccountPanel();

        alert(
          saved
            ? `ÄÃ£ lÆ°u "${book.title}" vÃ o tá»§ sÃ¡ch.`
            : `ÄÃ£ bá» "${book.title}" khá»i tá»§ sÃ¡ch.`
        );
        return;
      }

      const card = target.closest(".book-card");
      if (card?.dataset.id) {
        openBookFromList(card.dataset.id);
      }
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", async () => {
      await handleSearchSubmit();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", handleSearchInputDebounced);

    searchInput.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        await handleSearchSubmit();
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
    saveShelfBtn.addEventListener("click", async () => {
      if (!currentBook) return;

      const saved = await toggleShelfSmart(currentBook.id, currentChapterIndex + 1);
      updateSaveShelfButton(currentBook.id);
      renderBooks();
      if (accountModal && !accountModal.classList.contains('hidden')) renderAccountPanel();

      alert(
        saved
          ? `ÄÃ£ lÆ°u "${currentBook.title}" vÃ o tá»§ sÃ¡ch.`
          : `ÄÃ£ bá» "${currentBook.title}" khá»i tá»§ sÃ¡ch.`
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

  window.addEventListener("popstate", handleRoute);

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
  loginLink = $("loginLink");
  logoutLink = $("logoutLink");
  authModal = $("authModal");
  authCloseBtn = $("authCloseBtn");
  authEmail = $("authEmail");
  authPassword = $("authPassword");
  authPasswordConfirm = $("authPasswordConfirm");
  authPasswordConfirmWrap = $("authPasswordConfirmWrap");
  authModeLoginBtn = $("authModeLoginBtn");
  authModeRegisterBtn = $("authModeRegisterBtn");
  authBackLoginBtn = $("authBackLoginBtn");
  authLoginBtn = $("authLoginBtn");
  authRegisterBtn = $("authRegisterBtn");
  authTitle = $("authTitle");
  authMessage = $("authMessage");
  accountModal = $("accountModal");
  accountCloseBtn = $("accountCloseBtn");
  accountEmail = $("accountEmail");
  accountLogoutBtn = $("accountLogoutBtn");
  accountShelfList = $("accountShelfList");
  accountProgressList = $("accountProgressList");
  commentsSection = $("commentsSection");
  commentsHint = $("commentsHint");
  commentsRefreshBtn = $("commentsRefreshBtn");
  commentForm = $("commentForm");
  commentInput = $("commentInput");
  commentStatus = $("commentStatus");
  commentSubmitBtn = $("commentSubmitBtn");
  commentsList = $("commentsList");
  relatedBooksSection = $("relatedBooksSection");
  relatedBooksGrid = $("relatedBooksGrid");
  relatedMoreBtn = $("relatedMoreBtn");

  shelfLink = $("shelfLink") || document.querySelector('.nav a:nth-child(4)');
  booksPanelTitle = $("booksPanelTitle");
  continueReadingPanel = $("continueReadingPanel");
  continueReadingGrid = $("continueReadingGrid");
  continueRefreshBtn = $("continueRefreshBtn");
  continueToggleBtn = $("continueToggleBtn");
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
  updateAuthUI();
  checkCurrentUser();
  loadBooks();

  // Handle GitHub Pages 404 redirect
  const redirectPath = sessionStorage.getItem('redirectPath');
  if (redirectPath) {
    sessionStorage.removeItem('redirectPath');
    // Replace history to show the correct URL
    if (redirectPath !== '/') {
      window.history.replaceState(null, '', redirectPath);
    }
  }

  lastScrollY = window.scrollY || 0;
  handleMobileTopbarScroll();
});

function setupChapterAudioPlayer() {
  setupAudioPlayer(STORAGE_KEYS);
}




// Robust delegated handler for Continue Reading controls.
// This catches the click even if the panel is re-rendered or refs were not ready.
document.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest("#continueToggleBtn");
  if (toggleBtn) {
    e.preventDefault();
    continueExpanded = !continueExpanded;
    renderContinueReadingPanel();
    return;
  }

  const continueCard = e.target.closest("[data-continue-book]");
  if (continueCard) {
    e.preventDefault();
    goToBook(
      continueCard.dataset.continueBook,
      Number(continueCard.dataset.continueChapter || 0)
    );
  }
});




window.addEventListener("load", () => {
  setTimeout(async () => {
    updateAuthUI();
    await openRouteFromCurrentUrl();

    if (currentBook) {
      refreshReaderSidePanels();
    }
  }, 250);
});




window.addEventListener("load", () => {
  setTimeout(async () => {
    if (window.TRUYENFULLVN_PAGE && window.TRUYENFULLVN_PAGE.mode === "chapter") {
      await hydrateServerRenderedChapter();
    }
  }, 300);
});

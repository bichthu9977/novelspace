import { apiFetch } from "./api.js";

export function getReadingProgressMap(storageKeys, safeParseJSON) {
  const progress = safeParseJSON(localStorage.getItem(storageKeys.progress), {});
  return progress && typeof progress === "object" && !Array.isArray(progress) ? progress : {};
}

export function setReadingProgressMap(storageKeys, progress) {
  localStorage.setItem(storageKeys.progress, JSON.stringify(progress));
}

export function getReadingProgress(storageKeys, safeParseJSON, bookId) {
  const progress = getReadingProgressMap(storageKeys, safeParseJSON);
  const rawValue = progress[String(bookId)];
  const index = Number(rawValue);
  return Number.isFinite(index) && index >= 0 ? index : 0;
}

export function setReadingProgress(storageKeys, safeParseJSON, bookId, chapterIndex) {
  const progress = getReadingProgressMap(storageKeys, safeParseJSON);
  progress[String(bookId)] = chapterIndex;
  setReadingProgressMap(storageKeys, progress);
  localStorage.setItem(storageKeys.lastBookId, String(bookId));
}

export async function saveRemoteReadingProgress(bookId, chapterNumber, headers) {
  return apiFetch("/api/progress", {
    method: "POST",
    headers,
    body: JSON.stringify({
      book_id: Number(bookId),
      chapter_number: Number(chapterNumber || 1)
    })
  });
}

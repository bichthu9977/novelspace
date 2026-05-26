import { apiFetch } from "./api.js";

export function getSavedShelf(storageKeys, safeParseJSON) {
  const shelf = safeParseJSON(localStorage.getItem(storageKeys.shelf), []);
  return Array.isArray(shelf) ? shelf : [];
}

export function setSavedShelf(storageKeys, shelf) {
  localStorage.setItem(storageKeys.shelf, JSON.stringify(shelf));
}

export function isBookSaved(storageKeys, safeParseJSON, bookId) {
  return getSavedShelf(storageKeys, safeParseJSON).some((id) => Number(id) === Number(bookId));
}

export function saveToShelf(storageKeys, safeParseJSON, bookId) {
  const shelf = getSavedShelf(storageKeys, safeParseJSON);
  if (!shelf.some((id) => Number(id) === Number(bookId))) {
    shelf.push(Number(bookId));
    setSavedShelf(storageKeys, shelf);
  }
}

export function removeFromShelf(storageKeys, safeParseJSON, bookId) {
  const shelf = getSavedShelf(storageKeys, safeParseJSON).filter((id) => Number(id) !== Number(bookId));
  setSavedShelf(storageKeys, shelf);
}

export async function addRemoteBookmark(bookId, chapterNumber, headers) {
  return apiFetch("/api/bookmarks", {
    method: "POST",
    headers,
    body: JSON.stringify({
      book_id: Number(bookId),
      chapter_number: Number(chapterNumber || 1)
    })
  });
}

export async function deleteRemoteBookmark(bookId, headers) {
  return apiFetch(`/api/bookmarks/${Number(bookId)}`, {
    method: "DELETE",
    headers
  });
}

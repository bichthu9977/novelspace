export const API_BASE_URL =
  window.location.hostname === "truyenfullvn.org" ||
  window.location.hostname === "www.truyenfullvn.org"
    ? "https://api.truyenfullvn.org"
    : "http://127.0.0.1:8000";

export const LEGACY_AUDIO_BASE_URL = "https://audio.truyenfullvn.org/";
export const AUDIO_BASE_URL = "https://audio.novel-space.com/";

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export function normalizeAudioUrl(url) {
  if (typeof url !== "string") return "";
  return url.trim().replace(LEGACY_AUDIO_BASE_URL, AUDIO_BASE_URL);
}

export async function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), options);
}

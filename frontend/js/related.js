import { apiFetch } from "./api.js";

export function shuffleArray(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

export async function fetchTrendingBooks(limit = 12) {
  return apiFetch(`/api/trending?limit=${limit}`, { cache: "no-store" });
}

export async function fetchRecentlyUpdatedBooks(page = 1, limit = 12) {
  return apiFetch(`/api/recently-updated?page=${page}&limit=${limit}`, { cache: "no-store" });
}

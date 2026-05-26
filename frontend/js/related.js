import { apiFetch } from "./api.js";

export function shuffleArray(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

export async function fetchTrendingBooks(limit = 12) {
  return apiFetch(`/api/trending?limit=${limit}`, { cache: "no-store" });
}

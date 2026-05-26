export function $(id) {
  return document.getElementById(id);
}

export function assetUrl(path) {
  const value = String(path || "").trim();

  if (!value) return "/images/default.jpg";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return value;

  return `/${value.replace(/^\.?\//, "")}`;
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeParseJSON(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

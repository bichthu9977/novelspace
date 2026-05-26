import { apiFetch } from "./api.js";

export function getCommentUserLabel(comment) {
  if (comment?.email) return comment.email;
  if (comment?.user_email) return comment.user_email;
  if (comment?.user?.email) return comment.user.email;
  if (comment?.user_id) return `Người đọc #${comment.user_id}`;
  return "Người đọc";
}

export function formatCommentTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export async function fetchBookComments(bookId) {
  return apiFetch(`/api/books/${Number(bookId)}/comments`, { cache: "no-store" });
}

export async function postBookComment(bookId, content, headers) {
  return apiFetch("/api/comments", {
    method: "POST",
    headers,
    body: JSON.stringify({
      book_id: Number(bookId),
      content
    })
  });
}

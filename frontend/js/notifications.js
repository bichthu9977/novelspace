import { apiFetch } from "./api.js";

export async function fetchNotifications(headers, limit = 20) {
  return apiFetch(`/api/notifications?limit=${limit}`, {
    cache: "no-store",
    headers
  });
}

export async function fetchUnreadCount(headers) {
  return apiFetch("/api/notifications/unread-count", {
    cache: "no-store",
    headers
  });
}

export async function markNotificationRead(notificationId, headers) {
  return apiFetch(`/api/notifications/${Number(notificationId)}/read`, {
    method: "POST",
    headers
  });
}

export async function markAllNotificationsRead(headers) {
  return apiFetch("/api/notifications/read-all", {
    method: "POST",
    headers
  });
}

export function getAuthToken(storageKeys) {
  return localStorage.getItem(storageKeys.authToken) || "";
}

export function setAuthToken(storageKeys, token) {
  if (token) {
    localStorage.setItem(storageKeys.authToken, token);
  }
}

export function clearAuthToken(storageKeys) {
  localStorage.removeItem(storageKeys.authToken);
  localStorage.removeItem(storageKeys.authEmail);
}

export function isLoggedIn(storageKeys) {
  return Boolean(getAuthToken(storageKeys));
}

export function getAuthHeaders(storageKeys, extraHeaders = {}) {
  const token = getAuthToken(storageKeys);
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

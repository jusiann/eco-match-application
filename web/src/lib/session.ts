import { BackendRole } from "./api";

// Yalnızca access token localStorage'da tutulur (1 saat ömürlü). Refresh token
// artık httpOnly cookie'de (K-18) -- JS'ten hiç görünmez/erişilmez, bu yüzden
// burada saklanacak ikinci bir token yok. Süresi dolan access token
// authApi.refresh() ile (cookie üzerinden, credentials:'include') yenilenir.
const ACCESS_TOKEN_KEY = "ecomatch_access_token";

// EXPERT'in kendi paneli yok (yalnızca admin/review-queue'ya admin ile birlikte
// erişir) -- en yakın karşılığı olan "admin" paneline düşer.
export const ROLE_MAP: Record<BackendRole, "user" | "admin" | "osb"> = {
  USER: "user",
  FACILITY_ADMIN: "user",
  EXPERT: "admin",
  OSB_MANAGER: "osb",
  ADMIN: "admin",
};

export function saveAccessToken(accessToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

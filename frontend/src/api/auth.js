import {
  clearStoredAuthSession,
  get,
  getStoredAccessToken,
  getStoredAuthProfile,
  post,
  setStoredAccessToken,
  setStoredAuthProfile
} from "./http";

function normalizeAuthProfile(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
  if (!userId) {
    return null;
  }
  const displayName = typeof raw.displayName === "string" && raw.displayName.trim()
    ? raw.displayName.trim()
    : userId;
  const expiresAt = Number.isFinite(Number(raw.expiresAt)) ? Number(raw.expiresAt) : null;
  return { userId, displayName, expiresAt };
}

export async function loginWithInviteCode(inviteCode) {
  const code = typeof inviteCode === "string" ? inviteCode.trim() : "";
  if (!code) {
    throw new Error("请输入邀请码");
  }
  const response = await post("/api/auth/login", { inviteCode: code });
  const accessToken = setStoredAccessToken(response?.accessToken || "");
  if (!accessToken) {
    throw new Error("登录失败：服务端未返回有效访问令牌");
  }
  const profile = setStoredAuthProfile(response);
  return {
    accessToken,
    profile: profile || normalizeAuthProfile(response)
  };
}

export async function fetchAuthMe() {
  const me = await get("/api/auth/me");
  const profile = setStoredAuthProfile(me);
  return profile || normalizeAuthProfile(me);
}

export function readLocalAuthSession() {
  const accessToken = getStoredAccessToken();
  const profile = getStoredAuthProfile();
  if (!accessToken || !profile) {
    return null;
  }
  return { accessToken, profile };
}

export function clearAuthSession(options = {}) {
  clearStoredAuthSession(options);
}


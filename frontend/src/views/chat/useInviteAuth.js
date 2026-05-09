import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { clearAuthSession, fetchAuthMe, loginWithInviteCode, readLocalAuthSession } from "../../api/auth";

function normalizeAuthProfile(rawProfile) {
  if (!rawProfile || typeof rawProfile !== "object") {
    return null;
  }
  const userId = String(rawProfile.userId || "").trim();
  if (!userId) {
    return null;
  }
  const displayName = String(rawProfile.displayName || "").trim() || userId;
  const expiresAt = Number.isFinite(Number(rawProfile.expiresAt)) ? Number(rawProfile.expiresAt) : null;
  return {
    userId,
    displayName,
    expiresAt
  };
}

function isInviteAuthFailureMessage(message) {
  const text = String(message || "").trim();
  return text.includes("邀请码验证未通过")
    || text.includes("登录已过期")
    || text.includes("登录已失效")
    || text.includes("请先输入邀请码")
    || text.includes("invite");
}

export function useInviteAuth(options = {}) {
  const {
    resetWorkspaceForAccountSwitch = () => {},
    bootstrapWorkspaceAfterAuth = async () => {}
  } = options;

  const authReady = ref(false);
  const authDialogVisible = ref(false);
  const authInviteCode = ref("");
  const authSubmitting = ref(false);
  const authUserProfile = ref(null);

  const authUserDisplayName = computed(() => {
    const profile = authUserProfile.value;
    if (!profile || typeof profile !== "object") {
      return "";
    }
    const displayName = String(profile.displayName || "").trim();
    if (displayName) {
      return displayName;
    }
    return String(profile.userId || "").trim();
  });

  function requireInviteLogin() {
    authReady.value = false;
    authUserProfile.value = null;
    authInviteCode.value = "";
    authDialogVisible.value = true;
  }

  function handleInviteAuthFailure(message) {
    if (!isInviteAuthFailureMessage(message)) {
      return false;
    }
    requireInviteLogin();
    ElMessage.warning("请先输入邀请码登录");
    return true;
  }

  async function ensureAuthenticatedSession() {
    const localSession = readLocalAuthSession();
    if (!localSession?.accessToken) {
      requireInviteLogin();
      return false;
    }
    try {
      const me = await fetchAuthMe();
      const profile = normalizeAuthProfile(me);
      if (!profile) {
        throw new Error("登录状态无效，请重新输入邀请码");
      }
      authUserProfile.value = profile;
      authReady.value = true;
      authDialogVisible.value = false;
      return true;
    } catch {
      clearAuthSession({ notify: false });
      requireInviteLogin();
      return false;
    }
  }

  async function submitInviteLogin() {
    if (authSubmitting.value) {
      return;
    }
    const inviteCode = String(authInviteCode.value || "").trim();
    if (!inviteCode) {
      ElMessage.warning("请输入邀请码");
      return;
    }
    authSubmitting.value = true;
    try {
      const result = await loginWithInviteCode(inviteCode);
      const profile = normalizeAuthProfile(result?.profile);
      if (!profile) {
        throw new Error("登录失败：用户信息缺失");
      }
      resetWorkspaceForAccountSwitch();
      authUserProfile.value = profile;
      authReady.value = true;
      authDialogVisible.value = false;
      await bootstrapWorkspaceAfterAuth();
      ElMessage.success(`已登录：${profile.displayName}`);
    } catch (error) {
      ElMessage.error(error.message || "邀请码验证失败");
      requireInviteLogin();
    } finally {
      authSubmitting.value = false;
    }
  }

  function switchAccount() {
    clearAuthSession({ notify: false });
    resetWorkspaceForAccountSwitch();
    requireInviteLogin();
  }

  function onAuthExpired() {
    if (!authReady.value && authDialogVisible.value) {
      return;
    }
    resetWorkspaceForAccountSwitch();
    requireInviteLogin();
    ElMessage.warning("登录已失效，请重新输入邀请码");
  }

  return {
    authReady,
    authDialogVisible,
    authInviteCode,
    authSubmitting,
    authUserProfile,
    authUserDisplayName,
    requireInviteLogin,
    handleInviteAuthFailure,
    ensureAuthenticatedSession,
    submitInviteLogin,
    switchAccount,
    onAuthExpired
  };
}


(function () {
  "use strict";

  const config = window.RAINDOGS_SUPABASE;
  if (!config?.url || !config?.publishableKey) return;

  const SESSION_KEY = "rdSupabaseSession";

  function storageForSession() {
    return localStorage.getItem("rdRememberMe") === "1" ? localStorage : sessionStorage;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  function saveSession(session, remember) {
    clearSession();
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session));
  }

  function readSession() {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { clearSession(); return null; }
  }

  function sessionIsFresh(session) {
    return Boolean(session?.access_token && Number(session?.expires_at || 0) > Math.floor(Date.now() / 1000) + 30);
  }

  async function refreshSession(session) {
    if (!session?.refresh_token) throw new Error("Oturum süresi doldu.");
    return request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
  }

  async function request(path, options) {
    const response = await fetch(config.url + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        apikey: config.publishableKey,
        ...(options?.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
    return data;
  }

  async function charterName(charterId, accessToken) {
    if (!charterId) return "";
    const rows = await request(`/rest/v1/charters?id=eq.${encodeURIComponent(charterId)}&select=name`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    return rows?.[0]?.name || "";
  }

  async function appUser(profile, session) {
    const chapter = profile.charter_name || await charterName(profile.charter_id, session.access_token).catch(() => "");
    return {
      id: profile.id,
      nick: profile.nick,
      name: profile.full_name,
      chapter,
      role: profile.charter_role || (profile.member_level === "hangaround" ? "Hangaround" : profile.member_level === "prospect" ? "Prospect" : "Member"),
      nationalRole: profile.national_role || "",
      accessLevel: profile.national_role ? "national" : "member",
      isAdmin: Boolean(profile.is_app_admin),
      status: profile.account_status === "active" ? "Aktif" : profile.account_status === "pending" ? "Onay Bekliyor" : profile.account_status,
      km: 0,
      events: 0,
      backend: "supabase"
    };
  }

  async function profileForSession(session) {
    const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,nick,full_name,member_level,account_status,charter_id,charter_role,national_role,is_app_admin`, {
      method: "GET",
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const profile = rows?.[0];
    if (!profile || !["active", "pending"].includes(profile.account_status)) throw new Error("Üyeliğin aktif değil.");
    return profile;
  }

  async function restoreSession() {
    const stored = readSession();
    if (!stored) return;
    try {
      const session = sessionIsFresh(stored) ? stored : await refreshSession(stored);
      const profile = await profileForSession(session);
      const user = await appUser(profile, session);
      const remember = localStorage.getItem("rdRememberMe") === "1";
      saveSession(session, remember);
      currentUser = user;
      localStorage.removeItem("rdUser");
      sessionStorage.setItem("rdUser", JSON.stringify(user));
      boot();
    } catch (error) {
      clearSession();
      localStorage.removeItem("rdRememberMe");
      localStorage.removeItem("rdUser");
      sessionStorage.removeItem("rdUser");
      currentUser = null;
      boot();
    }
  }

  async function loginByNick(nick, password) {
    return request("/functions/v1/login-by-nick", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.publishableKey}` },
      body: JSON.stringify({ nick, password })
    });
  }

  async function registerMember(payload) {
    return request("/functions/v1/register-member", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.publishableKey}` },
      body: JSON.stringify(payload)
    });
  }

  window.registerUser = async function () {
    const button = document.querySelector("#registerForm .btn.primary");
    const fullName = document.getElementById("regName")?.value.trim() || "";
    const email = document.getElementById("regEmail")?.value.trim() || "";
    const password = document.getElementById("regPassword")?.value || "";
    const charter = document.getElementById("regChapter")?.value || "";
    const phone = document.getElementById("regPhone")?.value.trim() || "";
    const requestedRole = document.getElementById("regRole")?.value || "";
    const requestedNationalRole = document.getElementById("regNationalRole")?.value || "";
    const noNick = document.getElementById("regNickMode")?.value === "noNick";
    const nick = noNick ? "" : document.getElementById("regNick")?.value.trim() || "";
    if (!fullName || !email || !password || !charter || !phone || !requestedRole) { safeToast("Zorunlu alanların tamamını doldur."); return; }
    if (!noNick && !nick) { safeToast("Mevcut nickini gir veya henüz nickim yok seçeneğini kullan."); return; }
    if (password.length < 8) { safeToast("Şifre en az 8 karakter olmalı."); return; }
    if (!document.getElementById("kvkkCheck")?.checked || !document.getElementById("termsCheck")?.checked || !document.getElementById("contactCheck")?.checked) {
      safeToast("Kayıt için aydınlatma, kullanım ve iletişim onaylarını kabul etmelisin."); return;
    }
    if (button) { button.disabled = true; button.textContent = "Başvuru gönderiliyor…"; }
    try {
      const result = await registerMember({ fullName, email, password, charter, phone, requestedRole, requestedNationalRole, nick, noNick });
      const user = await appUser(result.profile, result.session);
      saveSession(result.session, false);
      localStorage.removeItem("rdRememberMe");
      localStorage.removeItem("rdUser");
      sessionStorage.setItem("rdUser", JSON.stringify(user));
      currentUser = user;
      boot();
      safeToast("Başvurun alındı. Charter yönetimi onayladığında hesabın aktif olacak.");
    } catch (error) {
      safeToast(error?.message || "Başvuru gönderilemedi.");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Gönder"; }
    }
  };

  window.loginUser = async function () {
    const button = document.querySelector("#loginForm .btn.primary");
    const nick = document.getElementById("loginNick")?.value.trim();
    const password = document.getElementById("loginNickPassword")?.value || "";
    const remember = Boolean(document.getElementById("rememberMe")?.checked);
    if (!nick || !password) { safeToast("Nick ve şifre gir."); return; }

    if (button) { button.disabled = true; button.textContent = "Giriş yapılıyor…"; }
    try {
      const result = await loginByNick(nick, password);
      const user = await appUser(result.profile, result.session);
      saveSession(result.session, remember);
      if (remember) localStorage.setItem("rdRememberMe", "1");
      else localStorage.removeItem("rdRememberMe");
      currentUser = user;
      localStorage.removeItem("rdUser");
      sessionStorage.setItem("rdUser", JSON.stringify(user));
      boot();
    } catch (error) {
      safeToast(error?.message || "Nick veya şifre hatalı ya da üyelik aktif değil.");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Gir"; }
    }
  };

  const oldLogout = window.logout;
  window.logout = async function () {
    const session = readSession();
    if (session?.access_token) {
      fetch(config.url + "/auth/v1/logout", {
        method: "POST",
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}` }
      }).catch(() => {});
    }
    clearSession();
    localStorage.removeItem("rdRememberMe");
    localStorage.removeItem("rdUser");
    sessionStorage.removeItem("rdUser");
    if (typeof oldLogout === "function") location.reload();
  };

  const type = document.getElementById("loginType");
  if (type) {
    type.value = "nick";
    type.style.display = "none";
  }
  document.querySelector(".demoAccess")?.remove();
  const help = document.querySelector("#loginForm .helpText");
  if (help) help.textContent = "Onaylanmış üyeler nick ve kendilerine ait şifre ile güvenli giriş yapar.";
  const remember = document.getElementById("rememberMe");
  if (remember) remember.checked = localStorage.getItem("rdRememberMe") === "1";
  restoreSession();
})();

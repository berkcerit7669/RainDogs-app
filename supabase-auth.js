(function () {
  "use strict";

  const config = window.RAINDOGS_SUPABASE;
  if (!config?.url || !config?.publishableKey) return;

  const SESSION_KEY = "rdSupabaseSession";

  if (localStorage.getItem("rdRememberMe") !== "1") {
    localStorage.removeItem("rdUser");
    localStorage.removeItem(SESSION_KEY);
  }

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
      window.dispatchEvent(new CustomEvent("raindogs:authenticated", { detail: { user } }));
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
      window.dispatchEvent(new CustomEvent("raindogs:authenticated", { detail: { user } }));
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
      window.dispatchEvent(new CustomEvent("raindogs:authenticated", { detail: { user } }));
    } catch (error) {
      safeToast(error?.message || "Nick veya şifre hatalı ya da üyelik aktif değil.");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Gir"; }
    }
  };

  let backendApplications = [];
  let applicationsLoading = false;
  let canGrantNationalApplicationRole = false;
  const levelLabel = { hangaround: "Hangaround", prospect: "Prospect", member: "Member" };
  const charterRoleOptions = ["", "President", "Vice President", "Sgt. at Arms", "Secretary", "Treasurer", "Road Captain", "Tail Gunner"];
  const nationalRoleOptions = ["", "Amir", "NVP", "National Sgt. at Arms", "National Secretary", "National Treasurer", "National Road Captain", "National Tail Gunner"];

  async function authenticatedSession() {
    let session = readSession();
    if (!session) throw new Error("Oturum gerekli.");
    if (!sessionIsFresh(session)) {
      session = await refreshSession(session);
      saveSession(session, localStorage.getItem("rdRememberMe") === "1");
    }
    return session;
  }

  window.raindogsBackendRequest = async function (action, payload = {}) {
    const session = await authenticatedSession();
    return request(`/functions/v1/app-api?action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...payload })
    });
  };

  window.openPasswordRecovery = function () {
    const nick = document.getElementById("loginNick")?.value.trim() || "";
    openDetail(`${pill("Hesap Kurtarma")}<h3 style="font-size:28px;margin:14px 0">Şifreni Yenile</h3><p>Nickini gir. Hesabında doğrulanmış bir e-posta varsa güvenli bağlantıyı oraya göndereceğiz.</p><div class="fieldGroup"><input id="recoveryNick" class="input" autocomplete="username" placeholder="Nick" value="${typeof escapeHtml === "function" ? escapeHtml(nick) : ""}"><button id="recoverySendButton" class="btn primary" onclick="requestPasswordRecovery()">Bağlantıyı Gönder</button></div><div class="helpText">Güvenlik nedeniyle hesabın var olup olmadığı ekranda açıklanmaz.</div>`);
  };

  window.requestPasswordRecovery = async function () {
    const nick = document.getElementById("recoveryNick")?.value.trim() || "";
    const button = document.getElementById("recoverySendButton");
    if (nick.length < 2) return safeToast("Geçerli nickini gir.");
    if (button) { button.disabled = true; button.textContent = "Gönderiliyor…"; }
    try {
      const result = await request("/functions/v1/request-password-reset", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.publishableKey}` },
        body: JSON.stringify({ nick })
      });
      closeDetail();
      safeToast(result.message || "Hesap uygunsa bağlantı e-posta adresine gönderildi.");
    } catch (error) {
      safeToast(error?.message || "Şifre yenileme isteği gönderilemedi.");
    } finally { if (button) { button.disabled = false; button.textContent = "Bağlantıyı Gönder"; } }
  };

  let recoveryAccessToken = "";
  window.finishPasswordRecovery = async function () {
    const password = document.getElementById("recoveryPassword")?.value || "";
    const repeat = document.getElementById("recoveryPasswordRepeat")?.value || "";
    if (password.length < 8) return safeToast("Şifre en az 8 karakter olmalı.");
    if (password !== repeat) return safeToast("Şifreler eşleşmiyor.");
    try {
      await request("/auth/v1/user", {
        method: "PUT",
        headers: { Authorization: `Bearer ${recoveryAccessToken}` },
        body: JSON.stringify({ password })
      });
      recoveryAccessToken = "";
      history.replaceState({}, document.title, location.pathname);
      closeDetail();
      safeToast("Şifren yenilendi. Yeni şifrenle giriş yapabilirsin.");
    } catch (error) { safeToast(error?.message || "Şifre yenilenemedi. Bağlantının süresi dolmuş olabilir."); }
  };

  function handleRecoveryRedirect() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (hash.get("type") !== "recovery" || !hash.get("access_token")) return;
    recoveryAccessToken = hash.get("access_token") || "";
    setTimeout(() => openDetail(`${pill("Güvenli Bağlantı")}<h3 style="font-size:28px;margin:14px 0">Yeni Şifre Belirle</h3><div class="fieldGroup"><input id="recoveryPassword" class="input" type="password" autocomplete="new-password" placeholder="Yeni şifre (en az 8 karakter)"><input id="recoveryPasswordRepeat" class="input" type="password" autocomplete="new-password" placeholder="Yeni şifreyi tekrar et"><button class="btn primary" onclick="finishPasswordRecovery()">Şifreyi Kaydet</button></div>`), 0);
  }

  async function applicationRequest(path = "", options = {}) {
    const session = await authenticatedSession();
    return request(`/functions/v1/manage-member-applications${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) }
    });
  }

  async function loadBackendApplications(force = false) {
    if (applicationsLoading || (backendApplications.length && !force)) return;
    applicationsLoading = true;
    try {
      const result = await applicationRequest();
      backendApplications = result.applications || [];
      canGrantNationalApplicationRole = Boolean(result.canGrantNational);
      if (typeof render === "function") render("adminApplications");
    } catch (error) {
      safeToast(error?.message || "Başvurular alınamadı.");
    } finally { applicationsLoading = false; }
  }

  window.adminApplicationsScreen = function () {
    if (!applicationsLoading && !backendApplications.length) setTimeout(() => loadBackendApplications(), 0);
    const rows = backendApplications.map((app, index) => {
      const charter = Array.isArray(app.charters) ? app.charters[0] : app.charters;
      const requestedLevel = app.requested_member_level || app.member_level || "hangaround";
      const levelSelect = ["hangaround", "prospect", "member"].map(value => `<option value="${value}" ${requestedLevel === value ? "selected" : ""}>${levelLabel[value]}</option>`).join("");
      const charterSelect = charterRoleOptions.map(value => `<option value="${value}" ${String(app.requested_charter_role || "") === value ? "selected" : ""}>${value || "Charter görevi yok"}</option>`).join("");
      const nationalSelect = nationalRoleOptions.map(value => `<option value="${value}" ${String(app.requested_national_role || "") === value ? "selected" : ""}>${value || "National görev yok"}</option>`).join("");
      return card(`<div class="meta">${pill("Onay Bekliyor")}<span>${new Date(app.created_at).toLocaleDateString("tr-TR")}</span></div><h3>${escapeHtml(app.nick)}</h3><p>${escapeHtml(app.full_name)}<br>${escapeHtml(charter?.name || "-")} · Talep: ${escapeHtml(levelLabel[requestedLevel] || requestedLevel)}${app.requested_charter_role ? ` / ${escapeHtml(app.requested_charter_role)}` : ""}${app.requested_national_role ? `<br>National talebi: ${escapeHtml(app.requested_national_role)}` : ""}<br>${escapeHtml(app.phone || "")}</p><div class="fieldGroup"><select id="backendLevel_${index}">${levelSelect}</select><select id="backendCharterRole_${index}">${charterSelect}</select>${canGrantNationalApplicationRole ? `<select id="backendNationalRole_${index}">${nationalSelect}</select>` : ""}<div class="btnRow"><button class="btn primary" onclick="decideBackendApplication(${index},'approve')">Üyeliği Onayla</button><button class="btn danger" onclick="decideBackendApplication(${index},'reject')">Reddet</button></div></div>`);
    }).join("");
    return section("Charter Üyelik Başvuruları") + (applicationsLoading ? card("<h3>Başvurular yükleniyor…</h3>") : rows || emptyState("Bekleyen başvuru yok", "Yetki kapsamında bekleyen üyelik başvurusu bulunmuyor."));
  };

  window.decideBackendApplication = async function (index, action) {
    const app = backendApplications[index];
    if (!app) return;
    if (action === "reject") {
      appConfirm(`${app.nick} başvurusu reddedilsin mi?`, () => decideBackendApplication(index, "reject-confirmed"));
      return;
    }
    const normalizedAction = action === "reject-confirmed" ? "reject" : action;
    const payload = {
      profileId: app.id,
      action: normalizedAction,
      memberLevel: document.getElementById(`backendLevel_${index}`)?.value,
      charterRole: document.getElementById(`backendCharterRole_${index}`)?.value || "",
      nationalRole: canGrantNationalApplicationRole ? (document.getElementById(`backendNationalRole_${index}`)?.value || "") : ""
    };
    try {
      await applicationRequest("", { method: "POST", body: JSON.stringify(payload) });
      backendApplications.splice(index, 1);
      safeToast(normalizedAction === "approve" ? "Üyelik aktif edildi." : "Başvuru reddedildi.");
      render("adminApplications");
    } catch (error) { safeToast(error?.message || "Karar kaydedilemedi."); }
  };

  window.refreshBackendApplications = () => loadBackendApplications(true);

  window.changeOwnPassword = async function () {
    if (!currentUser?.backend) return;
    const next = document.getElementById("newPassword")?.value || "";
    const repeat = document.getElementById("newPasswordRepeat")?.value || "";
    if (next.length < 8) { safeToast("Yeni şifre en az 8 karakter olmalı."); return; }
    if (next !== repeat) { safeToast("Yeni şifreler eşleşmiyor."); return; }
    try {
      const session = await authenticatedSession();
      await request("/auth/v1/user", {
        method: "PUT",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ password: next })
      });
      const old = document.getElementById("oldPassword");
      const first = document.getElementById("newPassword");
      const second = document.getElementById("newPasswordRepeat");
      if (old) old.value = "";
      if (first) first.value = "";
      if (second) second.value = "";
      safeToast("Şifren güvenli şekilde güncellendi.");
    } catch (error) { safeToast(error?.message || "Şifre güncellenemedi."); }
  };

  const originalProfileScreen = window.profileScreen;
  if (typeof originalProfileScreen === "function") {
    window.profileScreen = function () {
      let html = originalProfileScreen();
      if (!currentUser?.backend) return html;
      html = html.replace(
        /<input id="oldPassword"[\s\S]*?<button class="btn primary" onclick="changeOwnPassword\(\)">Şifreyi Değiştir<\/button>/,
        `<input id="newPassword" class="input" type="password" autocomplete="new-password" placeholder="Yeni şifre (en az 8 karakter)"><input id="newPasswordRepeat" class="input" type="password" autocomplete="new-password" placeholder="Yeni şifreyi tekrar et"><button class="btn primary" onclick="changeOwnPassword()">Şifreyi Değiştir</button>`
      );
      return html;
    };
  }

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
  handleRecoveryRedirect();
  restoreSession();
})();

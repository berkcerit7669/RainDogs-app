(function () {
  "use strict";
  const VAPID_PUBLIC_KEY = "BKhEBrVNjt0SVSsLSHCSMYEl8cfrQmtyh8E3ZvpqbkIh4UoMHC_xwxMF0oLFwG19Iyn92pVxnAeDgaONVcpzt_s";

  function supported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function decode(value) {
    const pad = "=".repeat((4 - value.length % 4) % 4);
    const raw = atob((value + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  }
  async function registration() { return navigator.serviceWorker.register("./service-worker.js?v=82", { scope: "./" }); }
  async function subscription() { return supported() ? (await registration()).pushManager.getSubscription() : null; }

  window.enableDeviceNotifications = async function () {
    if (!supported()) return safeToast("Bu cihaz cihaz bildirimlerini desteklemiyor.");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return safeToast("Bildirim izni verilmedi.");
      const reg = await registration();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decode(VAPID_PUBLIC_KEY) });
      const json = sub.toJSON();
      await window.raindogsBackendRequest("push.subscribe", { endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
      safeToast("Cihaz bildirimleri açıldı.");
      if (typeof render === "function") render("settings");
    } catch (error) { safeToast(error?.message || "Cihaz bildirimi açılamadı."); }
  };

  window.disableDeviceNotifications = async function () {
    try {
      const sub = await subscription();
      if (sub) {
        await window.raindogsBackendRequest("push.unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      safeToast("Cihaz bildirimleri kapatıldı.");
      if (typeof render === "function") render("settings");
    } catch (error) { safeToast(error?.message || "Bildirim ayarı değiştirilemedi."); }
  };

  window.deviceNotificationControl = function () {
    if (!supported()) return `<div class="result">Bu cihaz gerçek zamanlı cihaz bildirimlerini desteklemiyor.</div>`;
    const denied = Notification.permission === "denied";
    return `<div class="card"><h3>Cihaz Bildirimleri</h3><p>Etkinlik onayı, zorunlu duyuru, üyelik ve kulüp evi hatırlatmaları telefonun kilit ekranına gelebilir.</p>${denied ? `<div class="result">Bildirim izni tarayıcı ayarlarından kapalı. Site ayarlarından izin ver.</div>` : `<div class="btnRow"><button class="btn primary" onclick="enableDeviceNotifications()">Cihaz Bildirimlerini Aç</button><button class="btn ghost" onclick="disableDeviceNotifications()">Kapat</button></div>`}<div class="helpText">iPhone ve iPad’de uygulamayı önce Ana Ekrana Ekle, sonra bu düğmeye dokun.</div></div>`;
  };

  const oldSettings = window.settingsScreen;
  if (typeof oldSettings === "function") window.settingsScreen = function () { return deviceNotificationControl() + oldSettings(); };
  window.addEventListener("raindogs:authenticated", () => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("screen");
    if (!raw || typeof go !== "function") return;
    const [screen, scope] = raw.split(":");
    const known = new Set(["notifications", "events", "news", "routes", "charterHub", "help", "helpAdmin", "approvals", "charterApprovals", "nationalPublishApprovals"]);
    if (known.has(screen)) setTimeout(() => {
      if ((scope === "national" || scope === "charter") && typeof appScope !== "undefined") { appScope = scope; localStorage.setItem("rdAppScope", scope); }
      go(["charterApprovals", "nationalPublishApprovals", "approvals"].includes(screen) ? "notifications" : screen);
    }, 0);
    params.delete("screen");
    history.replaceState({}, document.title, `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
  });
  if (supported()) registration().catch(() => {});

  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      if (document.visibilityState === "hidden") location.reload();
    });
    navigator.serviceWorker.register("./service-worker.js?v=82", { scope: "./" }).then((reg) => {
      const checkForUpdate = () => reg.update().catch(() => {});
      setInterval(checkForUpdate, 5 * 60 * 1000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
      window.addEventListener("focus", checkForUpdate);
    }).catch(() => {});
  }

  function silentDataRefresh() {
    if (typeof currentUser !== "undefined" && currentUser?.backend && typeof hydrate === "function") hydrate(true);
  }
  setInterval(silentDataRefresh, 2 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") silentDataRefresh(); });
  window.addEventListener("focus", silentDataRefresh);
})();

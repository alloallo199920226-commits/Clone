/* Follow real document/API/image loading, never a timed successful redirect. */
(() => {
  const root = document.documentElement;
  const key = "shineray-page-navigation";
  const destination = location.pathname + location.search;
  const pending = new Set();
  let phase = "idle";
  let watchdog;
  let frame;
  let originalInert = false;
  let documentReady = document.readyState === "complete";
  document.addEventListener("DOMContentLoaded", () => { documentReady = true; }, { once: true });
  const overlay = document.createElement("div");
  overlay.id = "site-navigation-loading";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-label", "Chargement de la page");
  overlay.tabIndex = -1;
  overlay.innerHTML = `<svg class="site-navigation-spinner" viewBox="0 0 40 40" aria-hidden="true">${
    Array.from({ length: 8 }, (_, i) => `<rect x="18" y="2" width="4" height="12" rx=".5" transform="rotate(${i * 45} 20 20)" opacity="${(i + 1) / 8}"/>`).join("")
  }</svg><div class="site-navigation-message" hidden><p>Le chargement prend du temps. Vérifiez votre connexion.</p><button type="button" data-navigation-retry>Réessayer</button><button type="button" data-navigation-cancel>Fermer</button></div>`;
  root.append(overlay);

  function remember(path) {
    try { sessionStorage.setItem(key, JSON.stringify({ path, at: Date.now() })); } catch { /* Private storage may be disabled. */ }
  }
  function forget() {
    try { sessionStorage.removeItem(key); } catch { /* No stored marker. */ }
  }
  function holdFocus() {
    if (!document.body) return;
    originalInert = document.body.inert;
    document.body.inert = true;
    overlay.focus({ preventScroll: true });
  }
  function finish() {
    phase = "idle";
    clearTimeout(watchdog);
    cancelAnimationFrame(frame);
    root.classList.remove("site-navigation-pending");
    if (document.body) document.body.inert = originalInert;
    overlay.querySelector(".site-navigation-message").hidden = true;
    delete overlay.dataset.state;
    forget();
  }
  function check() {
    if (phase !== "incoming") return;
    const busy = document.querySelector('[aria-busy="true"]');
    // Below-the-fold lazy images may not start until the user can scroll.
    // Waiting for them while the document is inert deadlocks navigation.
    const waitingForImages = () => [...document.images].some(image =>
      image.getAttribute("loading")?.toLowerCase() !== "lazy" && !image.complete);
    if (documentReady && pending.size === 0 && !busy && !waitingForImages()) {
      // Let response handlers and their newly inserted images render first.
      frame = requestAnimationFrame(() => {
        if (phase !== "incoming") return;
        if (pending.size || document.querySelector('[aria-busy="true"]') ||
            waitingForImages()) frame = requestAnimationFrame(check);
        else finish();
      });
    } else frame = requestAnimationFrame(check);
  }
  function show(nextPhase) {
    phase = nextPhase;
    root.classList.add("site-navigation-pending");
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      phase = "error";
      cancelAnimationFrame(frame);
      overlay.dataset.state = "error";
      overlay.querySelector(".site-navigation-message").hidden = false;
      overlay.querySelector("[data-navigation-retry]").focus();
    }, 45000);
    if (document.body) holdFocus();
    else document.addEventListener("DOMContentLoaded", holdFocus, { once: true });
    if (nextPhase === "incoming") frame = requestAnimationFrame(check);
  }
  let marker;
  try { marker = JSON.parse(sessionStorage.getItem(key)); } catch { marker = null; }
  if (marker?.path === destination && Date.now() - marker.at < 60000) show("incoming");
  else forget();

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    if (phase !== "incoming") return originalFetch.apply(this, args);
    const ticket = {};
    pending.add(ticket);
    try {
      const response = await originalFetch.apply(this, args);
      // Observe completion without delaying or consuming the caller's body.
      try {
        response.clone().arrayBuffer().then(() => pending.delete(ticket), () => pending.delete(ticket));
      } catch { pending.delete(ticket); }
      return response;
    } catch (error) {
      pending.delete(ticket);
      throw error;
    }
  };
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.closest('nav,[role="navigation"],.navbar,.bottom-navigation,[data-purpose="bottom-navigation"],[data-no-page-loading]') ||
        link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) ||
        url.pathname.startsWith("/api/") ||
        /\.(jpg|jpeg|png|svg|gif|webp|pdf|zip|css|js|ico)$/i.test(url.pathname)) return;
    const path = url.pathname + url.search;
    if (path === destination) return;
    event.preventDefault();
    remember(path);
    show("outgoing");
    // Paint the loader before starting ordinary, authenticated navigation.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (phase === "outgoing") location.assign(url.href);
    }));
  });
  overlay.querySelector("[data-navigation-retry]").addEventListener("click", () => {
    let next;
    try { next = JSON.parse(sessionStorage.getItem(key)); } catch { next = null; }
    const url = new URL(next?.path || destination, location.origin);
    if (url.origin !== location.origin) return finish();
    remember(url.pathname + url.search);
    location.assign(url.href);
  });
  overlay.querySelector("[data-navigation-cancel]").addEventListener("click", finish);
  window.addEventListener("pageshow", event => { if (event.persisted) finish(); });
})();

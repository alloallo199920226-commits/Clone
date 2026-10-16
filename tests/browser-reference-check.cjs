/* Run manually with the app workflow running and Chromium available.
   Creates one temporary development account, checks the signed-in mobile UI,
   writes screenshots under /tmp, then removes the account and browser profile. */
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { randomInt } = require("node:crypto");
const fs = require("node:fs");

async function main() {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  assert(domain, "Development preview domain is required");
  const base = `https://${domain}`;
  const profile = fs.mkdtempSync("/tmp/shineray-reference-browser-");
  const browser = spawn("chromium", [
    "--headless", "--no-sandbox", "--disable-dev-shm-usage",
    "--remote-debugging-port=9237", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  let socket;
  let userId;
  try {
    let tabs;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        tabs = await (await fetch("http://127.0.0.1:9237/json/list")).json();
        if (tabs.some(tab => tab.type === "page")) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(tabs, "Chromium did not start");
    socket = new WebSocket(tabs.find(tab => tab.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const pending = new Map();
    const paused = new Map();
    let sequence = 0;
    const errors = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Fetch.requestPaused") {
        paused.set(new URL(message.params.request.url).pathname, message.params.requestId);
      }
      if (message.method === "Runtime.exceptionThrown") {
        errors.push(message.params.exceptionDetails.text);
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Browser command timed out: ${method}`));
        }, 20000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await call("Runtime.evaluate", {
        expression, awaitPromise: true, returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    }
    async function waitFor(expression) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Timed out waiting for ${expression}`);
    }
    async function navigate(path) {
      await call("Page.navigate", { url: base + path });
      await waitFor(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(path)}`);
    }
    async function screenshot(name) {
      const result = await call("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`/tmp/${name}.png`, Buffer.from(result.data, "base64"));
    }
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 472, height: 864, deviceScaleFactor: 1, mobile: true,
    });
    await navigate("/connexion");
    if (process.argv.includes("--countries")) {
      const pauseConfig = "/api/country-picker/config";
      const pauseCountries = "/api/countries";
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      async function awaitPaused(path) {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (paused.has(path)) return;
          await sleep(50);
        }
        throw new Error(`Country request did not start: ${path}`);
      }
      async function resume(path) {
        const requestId = paused.get(path);
        paused.delete(path);
        await call("Fetch.continueRequest", { requestId });
      }
      await call("Fetch.enable", { patterns: [
        { urlPattern: "*api/country-picker/config*", requestStage: "Request" },
        { urlPattern: "*api/countries*", requestStage: "Request" },
      ] });
      await navigate("/inscription");
      await evaluate("document.querySelector('.country-trigger').click()");
      await awaitPaused(pauseConfig);
      await sleep(900);
      assert.equal(await evaluate("document.querySelector('[data-country-overlay]').dataset.stage"), "spinner");
      const geometry = await evaluate(`(() => {
        const sheet=document.querySelector('.country-sheet').getBoundingClientRect();
        const spinner=document.querySelector('.country-spinner').getBoundingClientRect();
        return {top:sheet.top,height:sheet.height,viewport:innerHeight,
          centerX:spinner.x+spinner.width/2,centerY:spinner.y+spinner.height/2,
          rays:document.querySelectorAll('.country-spinner span').length,
          header:getComputedStyle(document.querySelector('.sheet-header')).display};
      })()`);
      assert.equal(geometry.rays, 8);
      assert.equal(geometry.header, "none");
      assert(Math.abs(geometry.top - geometry.viewport / 2) <= 1, JSON.stringify(geometry));
      assert(Math.abs(geometry.height - geometry.viewport / 2) <= 1, JSON.stringify(geometry));
      assert(Math.abs(geometry.centerY - (geometry.top + geometry.height / 2)) <= 1, JSON.stringify(geometry));
      assert(Math.abs(geometry.centerX - 236) <= 1, JSON.stringify(geometry));
      await screenshot("shineray-country-spinner");
      await resume(pauseConfig);
      await waitFor("document.querySelector('[data-country-overlay]').dataset.stage === 'dots'");
      await awaitPaused(pauseCountries);
      await sleep(1100);
      assert.equal(await evaluate("document.querySelector('[data-country-overlay]').dataset.stage"), "dots");
      assert.equal(await evaluate("document.querySelector('.country-options').hidden"), true);
      const dotsY = await evaluate("(()=>{const r=document.querySelector('.country-dots').getBoundingClientRect();return r.y+r.height/2})()");
      assert(Math.abs(dotsY - geometry.centerY) <= 1);
      await screenshot("shineray-country-dots");
      await resume(pauseCountries);
      await waitFor("document.querySelector('[data-country-overlay]').dataset.stage === 'ready'");
      assert.equal(await evaluate("document.querySelectorAll('.country-option').length"), 2);
      await screenshot("shineray-country-ready");
      await evaluate("document.querySelector('[data-country-code=\"+225\"]').click()");
      assert.equal(await evaluate("document.querySelector('[name=country]').value"), "+225");
      assert.equal(await evaluate("document.querySelector('[data-country-overlay]').hidden"), true);
      await call("Fetch.disable");
      await navigate("/connexion");
      await call("Network.enable");
      await call("Network.emulateNetworkConditions", {
        offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
      });
      await evaluate("document.querySelector('.country-trigger').click()");
      await waitFor("document.querySelector('[data-country-overlay]').dataset.stage === 'error'");
      assert.equal(await evaluate("document.querySelector('.country-options').hidden"), true);
      assert(await evaluate("document.querySelector('[data-country-message]').textContent.includes('Internet')"));
      await call("Network.emulateNetworkConditions", {
        offline: false, latency: 120, downloadThroughput: 50000, uploadThroughput: 50000,
      });
      await evaluate("document.querySelector('[data-country-retry]').click()");
      await waitFor("document.querySelector('[data-country-overlay]').dataset.stage === 'ready'");
      await evaluate("document.querySelector('[data-country-code=\"+228\"]').click()");
      assert.equal(await evaluate("document.querySelector('[name=country]').value"), "+228");
      assert.equal(await evaluate("document.querySelector('[data-country-overlay]').hidden"), true);
      assert.deepEqual(errors, []);
      console.log("PASS: country picker geometry, eight-ray spinner, sequential real requests held under slow network, both pages, offline error and retry.");
      console.log("Screenshots: /tmp/shineray-country-spinner.png /tmp/shineray-country-dots.png /tmp/shineray-country-ready.png");
      return;
    }
    const phone = "9" + String(randomInt(1000000, 9999999));
    const payload = { country_code: "+228", phone, password: "reference-browser-test-password" };
    const registration = await evaluate(`(async () => {
      const response = await fetch('/api/auth/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(${JSON.stringify(payload)})
      });
      return {status:response.status, body:await response.json()};
    })()`);
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    userId = registration.body.user.id;
    await navigate("/accueil");
    await waitFor("Boolean(document.querySelector('dialog[open]'))");
    assert(await evaluate("document.querySelector('[data-notification-close]').textContent.includes('Désactiver les rappels')"));
    await screenshot("shineray-notification-mobile");
    const modal = await evaluate(`(() => {
      const dialog=document.querySelector('dialog[open]');
      const rect=dialog.getBoundingClientRect();
      const close=document.querySelector('[data-notification-close]').getBoundingClientRect();
      return {width:rect.width, height:rect.height, bottom:rect.bottom,
        viewport:innerHeight, closeBottom:close.bottom, overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert(modal.width >= 420 && modal.width <= 450, JSON.stringify(modal));
    assert(modal.bottom <= modal.viewport, JSON.stringify(modal));
    assert(modal.closeBottom <= modal.viewport, JSON.stringify(modal));
    assert.equal(modal.overflow, false);
    await evaluate("document.querySelector('[data-notification-close]').click()");
    assert.equal(await evaluate("Boolean(document.querySelector('dialog[open]'))"), false);
    await navigate("/compte");
    await waitFor("document.querySelector('[data-user-phone]')?.textContent.includes('228')");
    await waitFor("document.querySelector('[data-demo-balance]')?.textContent.trim() === '0'");
    await waitFor("[...document.images].every(image => image.complete)");
    assert(await evaluate("[...document.images].every(image => image.naturalWidth > 0)"), "Account photo failed to load");
    assert(await evaluate("document.querySelector('.hero-vehicle').getAttribute('src').startsWith('/page_d_accueil_shineray/')"), "Use a real local vehicle photo, not a remote screenshot");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.menu-row svg.fill-none')).fill"), "none");
    const account = await evaluate(`({
      logoutCount:document.querySelectorAll('[data-logout]').length,
      logoutText:document.querySelector('[data-logout]').textContent.trim(),
      menus:[...document.querySelectorAll('main a')].map(a=>a.getAttribute('href')),
      overflow:document.documentElement.scrollWidth>innerWidth
    })`);
    assert.equal(account.logoutCount, 1);
    assert(account.logoutText.includes("Sortie sécurisée"));
    assert.equal(account.overflow, false);
    for (const path of ["/recharger", "/retrait", "/financement", "/historique-recharges",
      "/historique-retraits", "/gestion-compte-bancaire", "/a-propos", "/regles", "/service-client"]) {
      assert(account.menus.includes(path) || await evaluate(`Boolean(document.querySelector('[data-route="${path}"]'))`), `Missing account route: ${path}`);
    }
    await screenshot("shineray-account-mobile");
    await navigate("/accueil");
    await waitFor("Boolean(document.querySelector('dialog[open]'))");
    await evaluate("document.querySelector('[data-notification-close]').click()");
    await navigate("/compte");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 744, deviceScaleFactor: 1, mobile: true,
    });
    await waitFor("document.querySelector('[data-user-phone]')?.textContent.includes('228')");
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
    await navigate("/accueil");
    await waitFor("Boolean(document.querySelector('dialog[open]'))");
    assert(await evaluate("document.querySelector('[data-notification-close]').getBoundingClientRect().bottom <= innerHeight"));
    await screenshot("shineray-notification-small-mobile");
    await evaluate("document.querySelector('[data-notification-close]').click()");
    await navigate("/compte");
    await waitFor("document.querySelector('[data-user-phone]')?.textContent.includes('228')");
    await evaluate("document.querySelector('[data-logout]').click()");
    await waitFor("location.pathname === '/connexion'");
    assert.deepEqual(errors, [], `Browser exceptions: ${JSON.stringify(errors)}`);
    console.log("PASS: signed-in notification, dismissal and re-entry, real account data, menu routes, photo, two mobile widths, logout.");
    console.log("Screenshots: /tmp/shineray-notification-mobile.png /tmp/shineray-account-mobile.png /tmp/shineray-notification-small-mobile.png");
  } finally {
    socket?.close();
    browser.kill("SIGTERM");
    if (Number.isSafeInteger(userId)) {
      execFileSync("python3", ["-c", [
        "import sys, auth_backend",
        "with auth_backend.connect() as conn, conn.cursor() as cur:",
        " cur.execute('DELETE FROM shineray_users WHERE id = %s', (int(sys.argv[1]),))",
      ].join("\n"), String(userId)], { stdio: "inherit" });
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

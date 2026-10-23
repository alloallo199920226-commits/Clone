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
  let base = `https://${domain}`;
  let fixtureServer;
  const adminFixture = "browser-console-" + randomInt(1e9);
  const profile = fs.mkdtempSync("/tmp/shineray-reference-browser-");
  const browser = spawn("chromium", [
    "--headless", "--no-sandbox", "--disable-dev-shm-usage",
    "--remote-debugging-port=9237", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  let socket;
  let userId;
  const childUserIds = [];
  let paymentFixtureIds = [];
  try {
    if (process.argv.includes("--deposit-flow") || process.argv.includes("--deposit-i18n")) {
      paymentFixtureIds = JSON.parse(execFileSync("python3", ["-c", [
        "import json, auth_backend",
        "from psycopg.types.json import Jsonb",
        "ids=[]",
        "with auth_backend.connect() as conn, conn.cursor() as cur:",
        " for name in ['MTN Mobile Money','MOOV Money']:",
        "  value={'country':'Togo','countryCode':'+228','operatorName':name,'receiverNumber':'90123456','receiverName':'Test merchant','isActive':True,'sortOrder':0}",
        "  cur.execute(\"INSERT INTO shineray_admin_resources(kind,value) VALUES('channel',%s) RETURNING id\",(Jsonb(value),))",
        "  ids.append(cur.fetchone()['id'])",
        "print(json.dumps(ids))",
      ].join("\n")], {encoding:"utf8"}));
    }
    if (process.argv.includes("--today-withdrawals") || process.argv.includes("--imported-admin") || process.argv.includes("--sonarapay") || process.argv.includes("--deposit-channels") || process.argv.includes("--withdrawal")) {
      // Isolated test server only: never read or replace the real admin secret.
      fixtureServer = spawn("python3", process.argv.includes("--sonarapay") ? ["-u", "tests/sonarapay_fixture.py"] : ["-u", "-c", [
        "import os",
        "os.environ['ADMIN_ACCESS_PASSWORD']='isolated-browser-console-password'",
        "os.environ['SONARAPAY_KEY']=''", // Legacy manual-flow checks must never call a live provider.
        "from server import Handler, ThreadingHTTPServer",
        "import admin_api",
        ...(process.argv.includes("--withdrawal") ? ["import withdrawals", "withdrawals.withdrawal_window_open=lambda:True"] : []),
        "original_audit=admin_api.audit",
        `admin_api.audit=lambda cur,actor,event,details=None:original_audit(cur,actor,event,{**(details or {}),'test_fixture':${JSON.stringify(adminFixture)}})`,
        "server=ThreadingHTTPServer(('127.0.0.1',0),Handler)",
        "print(server.server_port,flush=True)",
        "server.serve_forever()",
      ].join("\n")], { stdio: ["ignore", "pipe", "ignore"] });
      const port = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Isolated admin server did not start")), 15000);
        fixtureServer.once("error", error => { clearTimeout(timeout); reject(error); });
        fixtureServer.once("exit", () => { clearTimeout(timeout); reject(new Error("Isolated admin server exited")); });
        fixtureServer.stdout.once("data", data => { clearTimeout(timeout); resolve(Number(String(data).trim())); });
      });
      assert(Number.isSafeInteger(port) && port > 0);
      base = `http://127.0.0.1:${port}`;
    }
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
    const paymentResponses = [];
    const paymentRequests = [];
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Page.javascriptDialogOpening" &&
          process.argv.includes("--member-pages")) {
        call("Page.handleJavaScriptDialog", { accept: true }).catch(error => errors.push(error.message));
      }
      if (message.method === "Fetch.requestPaused") {
        paused.set(new URL(message.params.request.url).pathname, message.params.requestId);
      }
      if (message.method === "Runtime.exceptionThrown") {
        errors.push(message.params.exceptionDetails.text);
      }
      if (message.method === "Network.responseReceived" &&
          new URL(message.params.response.url).pathname === "/api/payments") {
        paymentResponses.push(message.params.response.status);
      }
      if (message.method === "Network.requestWillBeSent" &&
          new URL(message.params.request.url).pathname === "/api/payments" &&
          message.params.request.postData) {
        paymentRequests.push(JSON.parse(message.params.request.postData));
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
      await waitFor(`document.readyState === 'complete' && location.pathname + location.search === ${JSON.stringify(path)}`);
    }
    async function screenshot(name) {
      const result = await call("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`/tmp/${name}.png`, Buffer.from(result.data, "base64"));
    }
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Network.enable");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 472, height: 864, deviceScaleFactor: 1, mobile: true,
    });
    await navigate("/connexion");
    if (process.argv.includes("--form-controls")) {
      await require("./form-controls-browser.cjs")({ call, evaluate, navigate, publicOnly: true });
      await navigate("/connexion");
    }
    if (process.argv.includes("--auth-progress")) {
      await require("./auth-progress-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, paused, base,
        trackUser: id => { userId = id; },
      });
      assert.deepEqual(errors, []);
      return;
    }
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
      assert.equal(await evaluate("document.querySelectorAll('.country-option').length"), 6);
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
    const togo = process.argv.includes("--togo");
    const burkina = process.argv.includes("--burkina");
    const phone = !togo && !burkina && (process.argv.includes("--deposit-channels") || process.argv.includes("--sonarapay"))
      ? "01" + String(randomInt(10000000, 99999999))
      : "9" + String(randomInt(1000000, 9999999));
    const payload = { country_code: burkina ? "+226" : togo ? "+228" : (process.argv.includes("--deposit-channels") || process.argv.includes("--sonarapay")) ? "+229" : "+228",
      phone, password: "reference-browser-test-password" };
    const registration = await evaluate(`(async () => {
      const response = await fetch('/api/auth/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(${JSON.stringify(payload)})
      });
      return {status:response.status, body:await response.json()};
    })()`);
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    userId = registration.body.user.id;
    if (process.argv.includes("--support-links")) {
      await require("./support-links-browser.cjs")({call, evaluate, navigate, waitFor, screenshot});
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--gift-codes")) {
      await require("./gift-codes-browser.cjs")({
        call, evaluate, navigate, waitFor, screenshot, owner: registration.body.user,
      });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--vip-purchases")) {
      await require("./vip-purchases-browser.cjs")({
        call, evaluate, navigate, waitFor, screenshot, owner: registration.body.user,
      });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--sonarapay")) {
      await require("./sonarapay-browser.cjs")({ call, evaluate, navigate, waitFor, screenshot, phone, prefix: payload.country_code });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--deposit-channels")) {
      await require("./deposit-channels-browser.cjs")({ call, evaluate, navigate, waitFor, screenshot });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--form-controls")) {
      await require("./form-controls-browser.cjs")({ call, evaluate, navigate, publicOnly: false });
      assert.deepEqual(errors, []);
      return;
    }
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
    if (process.argv.includes("--today-withdrawals")) {
      await require("./today-withdrawals-browser.cjs")({evaluate, waitFor, navigate, screenshot});
      return;
    }
    if (process.argv.includes("--imported-admin")) {
      await require("./imported-admin-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, owner: registration.body.user,
      });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--financial-policy")) {
      await require("./financial-policy-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, owner: registration.body.user,
      });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--deposit-i18n")) {
      await require("./deposit-i18n-browser.cjs")({ call, evaluate, waitFor, navigate, screenshot, moovId: paymentFixtureIds[1] });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--missions")) {
      await require("./missions-browser.cjs")({ userId, call, evaluate, navigate, waitFor, screenshot });
      return;
    }
    if (process.argv.includes("--recharge-amounts")) {
      await navigate("/recharger");
      const expected = [3500,7000,12000,20000,40000,75000,100000,150000,250000];
      assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-amount-choice]')].map(b=>Number(b.dataset.amountChoice))"), expected);
      for (const amount of expected) {
        await evaluate(`document.querySelector('[data-amount-choice="${amount}"]').click()`);
        assert.equal(await evaluate("Number(document.querySelector('#amount').value)"), amount);
      }
      for (const width of [390, 472, 900]) {
        await call("Emulation.setDeviceMetricsOverride", {width,height:844,deviceScaleFactor:1,mobile:width<500});
        assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
        assert(await evaluate("parseFloat(getComputedStyle(document.querySelector('.recharge-amount')).borderTopWidth)>=1"));
      }
      await call("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
      for (const amount of [500, 3499]) {
        await evaluate(`document.querySelector('#amount').value='${amount}';document.querySelector('[data-payment-action]').click()`);
        assert.equal(await evaluate("location.pathname"), "/recharger");
        assert(await evaluate("document.querySelector('[data-payment-status]').textContent.replace(/\\s/g,'').includes('3500')"));
      }
      await evaluate("document.querySelector('#amount').value='3500';document.querySelector('[data-payment-action]').click()");
      await waitFor("location.pathname==='/choisir-operateur' && document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false' && document.querySelector('[data-deposit-amount]')?.textContent.replace(/[\\s,]/g,'').includes('3500')");
      assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('shineray-deposit-draft')).amount_fcfa"), 3500);
      assert(await evaluate("document.querySelector('[data-deposit-missing]').hidden && !document.querySelector('[data-deposit-content]').hidden"));
      await screenshot("recharge-3500-operator");
      await navigate("/recharger");
      assert.equal(await evaluate("document.querySelector('#amount').value"), "3500");
      await screenshot("recharge-3500-accepted");
      await evaluate("document.querySelector('#amount').value='5432';document.querySelector('#amount').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#amount').focus()");
      await screenshot("recharge-custom-amount");
      await evaluate("document.querySelector('[data-payment-action]').click()");
      await waitFor("location.pathname==='/choisir-operateur'");
      assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('shineray-deposit-draft')).amount_fcfa"), 5432);
      console.log("PASS: all nine recharge presets, clear input border, no overflow at390/472/900, 500/3499 rejected, 3500 accepted/restored and custom amount carried to payment; no payment submitted.");
      return;
    }
    if (process.argv.includes("--automatic-countries")) {
      await require("./automatic-countries-browser.cjs")({
        evaluate, navigate, waitFor, screenshot, trackUser: id => childUserIds.push(id),
      });
      return;
    }
    if (process.argv.includes("--deposit-flow")) {
      await navigate("/recharger");
      await evaluate("document.querySelector('[data-payment-action]').click()");
      assert(await evaluate("document.querySelector('[data-payment-status]').textContent.includes('minimum')"));
      await evaluate("document.querySelector('[data-amount-choice=\"12000\"]').click();document.querySelector('[data-channel-choice=\"1\"]').click();document.querySelector('[data-payment-action]').click()");
      await waitFor("location.pathname==='/choisir-operateur' && document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false' && !document.documentElement.classList.contains('site-navigation-pending')");
      assert.equal(await evaluate("document.querySelector('[data-deposit-amount]').textContent"), "FCFA 12,000");
      assert.equal(await evaluate("document.querySelector('[data-deposit-prefix]').textContent"), "+228");
      assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('shineray-deposit-draft')).channel"), 1);
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
      await screenshot("shineray-deposit-operator");
      await evaluate(`document.querySelector('[data-operator="${paymentFixtureIds[1]}"]').click();document.querySelector('#deposit-phone').value='123';document.querySelector('#deposit-operator-form').requestSubmit()`);
      assert(await evaluate("document.querySelector('[data-deposit-status]').textContent.includes('8 chiffres')"));
      await evaluate("document.querySelector('#deposit-phone').value='91234567';document.querySelector('#deposit-operator-form').requestSubmit()");
      await waitFor("location.pathname==='/confirmation-depot' && document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false' && !document.documentElement.classList.contains('site-navigation-pending')");
      assert.equal(await evaluate("document.querySelector('[data-selected-operator]').textContent"), "MOOV Money");
      assert.equal(await evaluate("document.querySelector('[data-deposit-phone]').textContent"), "+228 91234567");
      assert.equal(await evaluate("document.querySelector('[data-deposit-amount]').textContent"), "FCFA 12,000");
      assert.equal(await evaluate("document.querySelector('[data-deposit-reference]').textContent"), "—");
      assert.equal(await evaluate("document.querySelector('[data-copy=\"merchant_account\"]').disabled"), false);
      assert.equal(await evaluate("document.querySelector('[data-deposit-dial]').getAttribute('href')"), null);
      await evaluate("document.querySelector('[data-deposit-result]').click()");
      assert(await evaluate("document.querySelector('[data-deposit-status]').textContent.includes('Aucun paiement')"));
      await screenshot("shineray-deposit-confirmation");
      await call("Page.reload", { ignoreCache: true });
      await waitFor("document.querySelector('[data-deposit-phone]')?.textContent==='+228 91234567'");
      await evaluate("document.querySelector('[data-deposit-modify]').click()");
      await waitFor("location.pathname==='/choisir-operateur' && document.querySelector('#deposit-phone')?.value==='91234567'");
      assert.equal(await evaluate(`document.querySelector('[data-operator="${paymentFixtureIds[1]}"]').getAttribute('aria-pressed')`), "true");
      await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 744, deviceScaleFactor: 1, mobile: true });
      await waitFor("!document.documentElement.classList.contains('site-navigation-pending')");
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
      await screenshot("shineray-deposit-operator-small");
      await evaluate(`document.querySelector('[data-operator="${paymentFixtureIds[0]}"]').click();document.querySelector('#deposit-operator-form').requestSubmit()`);
      await waitFor("location.pathname==='/confirmation-depot' && document.querySelector('[data-selected-operator]')?.textContent==='MTN Mobile Money' && !document.documentElement.classList.contains('site-navigation-pending')");
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
      await screenshot("shineray-deposit-confirmation-small");
      assert.equal(await evaluate("fetch('/api/activity').then(r=>r.json()).then(data=>data.activities.length)"), 1);
      assert.equal(await evaluate("fetch('/api/me').then(r=>r.json()).then(data=>data.balance_fcfa)"), 2300);
      await evaluate("sessionStorage.removeItem('shineray-deposit-draft')");
      await navigate("/confirmation-depot");
      assert.equal(await evaluate("document.querySelector('[data-deposit-missing]').hidden"), false);
      assert.equal(await evaluate("document.querySelector('[data-deposit-content]').hidden"), true);
      await navigate("/choisir-operateur");
      assert.equal(await evaluate("document.querySelector('[data-deposit-missing]').hidden"), false);
      assert.deepEqual(errors, []);
      console.log("PASS: amount/channel entry, MTN/MOOV choice, phone validation, confirmation, modify/refresh preservation, admin placeholders, no transactions/credits, missing draft and 390/472px layouts.");
      return;
    }
    if (process.argv.includes("--iveco-about")) {
      await navigate("/a-propos");
      await waitFor("Boolean(document.querySelector('.about-opening h2'))");
      assert.equal(await evaluate("document.querySelector('.about-page .back').getAttribute('href')"), "/compte");
      assert.equal(await evaluate("document.querySelectorAll('.about-section').length"), 6);
      assert(await evaluate("document.querySelector('.about-content').innerText.split(/\\s+/).length >= 500"));
      const images = await evaluate("Array.from(document.querySelectorAll('.about-photo img'),image=>image.getAttribute('src'))");
      assert.equal(images.length, 5);
      assert.equal(new Set(images).size, 5);
      assert(!await evaluate("/\\b(?:SHINERAY|SWM|Sprite|AERONOVA)\\b/i.test(document.body.innerText + document.title)"));
      await waitFor("Array.from(document.styleSheets).some(sheet=>sheet.href?.includes('/pages/iveco-about.css') && sheet.cssRules.length > 10)");
      for (let i=0;i<images.length;i++) {
        await evaluate(`document.querySelectorAll('.about-photo img')[${i}].scrollIntoView({block:'center'})`);
        await waitFor(`document.querySelectorAll('.about-photo img')[${i}].complete && document.querySelectorAll('.about-photo img')[${i}].naturalWidth > 0`);
      }
      for (const [width,height] of [[390,844],[320,744],[1360,900]]) {
        await call("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile:width<700});
        assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
      }
      await call("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
      await evaluate("scrollTo(0,0)");
      await screenshot("iveco-about-editorial-top");
      await evaluate("document.querySelector('.about-work').scrollIntoView({block:'start'})");
      await screenshot("iveco-about-editorial-middle");
      await evaluate("document.querySelector('.about-finale').scrollIntoView({block:'start'})");
      await screenshot("iveco-about-editorial-bottom");
      await evaluate("document.querySelector('.about-page .back').click()");
      await waitFor("location.pathname === '/compte'");
      console.log("PASS: six French editorial sections, 500+ words, five distinct loaded IVECO photos, served scoped CSS, no overflow at 320/390/1360px and working account return. No financial operation submitted.");
      return;
    }
    if (process.argv.includes("--iveco-branding")) {
      const branded = async () => {
        await waitFor("! /\\b(?:SHINERAY|SWM|Sprite|AERONOVA|sonara[\\s-]*pay)\\b/i.test(document.title + ' ' + document.body.innerText)");
        assert(await evaluate("Boolean(document.querySelector('script[src^=\"/pages/iveco-brand.js\"]'))"));
      };
      for (const route of ["/accueil", "/notifications", "/compte", "/projet", "/equipe",
        "/mon-equipe", "/a-propos", "/regles", "/service-client", "/recharger", "/retrait",
        "/financement", "/historique-recharges", "/historique-retraits",
        "/gestion-compte-bancaire", "/ajouter-compte-retrait"]) {
        await navigate(route);
        await branded();
        if (route === "/notifications") await screenshot("iveco-branded-notification");
        if (route === "/equipe") {
          await waitFor("document.querySelector('.team-wordmark img[alt=\"IVECO\"]')?.naturalWidth > 0");
          await screenshot("iveco-branded-team");
        }
      }
      await evaluate(`(() => {
        const fixture=document.createElement('section');
        fixture.id='brand-test-fixture';
        fixture.innerHTML='<p>SHINERAY SWM Sprite AERONOVA</p><a href="/shineray-path">SHINERAY</a><input placeholder="SHINERAY" value="SHINERAY-secret"><img alt="SHINERAY" src="/pages/assets/iveco-auth-logo.png">';
        document.body.append(fixture);
        sessionStorage.setItem('iveco-brand-test', 'SHINERAY-original');
      })()`);
      await waitFor("document.querySelector('#brand-test-fixture p').textContent === 'IVECO IVECO IVECO IVECO'");
      assert.equal(await evaluate("document.querySelector('#brand-test-fixture input').value"), "SHINERAY-secret");
      assert.equal(await evaluate("document.querySelector('#brand-test-fixture input').placeholder"), "IVECO");
      assert.equal(await evaluate("document.querySelector('#brand-test-fixture a').getAttribute('href')"), "/shineray-path");
      assert.equal(await evaluate("sessionStorage.getItem('iveco-brand-test')"), "SHINERAY-original");
      await evaluate("document.querySelector('#brand-test-fixture p').firstChild.data='SHINERAY';document.querySelector('#brand-test-fixture img').alt='SWM';");
      await waitFor("document.querySelector('#brand-test-fixture p').textContent === 'IVECO' && document.querySelector('#brand-test-fixture img').alt === 'IVECO'");
      await evaluate(`(() => {
        const error=document.createElement('p');
        error.id='provider-brand-test';
        error.textContent='SonaraPay : erreur SONARAPAY / Sonara Pay / sonara-pay.';
        error.setAttribute('aria-label','Assistance SonaraPay');
        error.title='Paiement SONARAPAY';
        document.body.append(error);
        const link=document.createElement('a');
        link.id='provider-technical-test';
        link.href='/api/sonarapay/payments';
        link.textContent='SonaraPay';
        document.body.append(link);
        sessionStorage.setItem('provider-brand-fixture','sonarapay-original');
      })()`);
      await waitFor("document.querySelector('#provider-brand-test').textContent === 'service de paiement : erreur service de paiement / service de paiement / service de paiement.'");
      assert.equal(await evaluate("document.querySelector('#provider-brand-test').getAttribute('aria-label')"), "Assistance service de paiement");
      assert.equal(await evaluate("document.querySelector('#provider-brand-test').title"), "Paiement service de paiement");
      assert.equal(await evaluate("document.querySelector('#provider-technical-test').getAttribute('href')"), "/api/sonarapay/payments");
      assert.equal(await evaluate("sessionStorage.getItem('provider-brand-fixture')"), "sonarapay-original");
      await evaluate("document.querySelector('#provider-brand-test').firstChild.data='Réponse SonaraPay indisponible';document.querySelector('#provider-brand-test').title='SonaraPay';");
      await waitFor("document.querySelector('#provider-brand-test').textContent==='Réponse service de paiement indisponible' && document.querySelector('#provider-brand-test').title==='service de paiement'");
      await navigate("/omarshark-junior-panam");
      await branded();
      await waitFor("document.querySelector('.admin-login-brand img[alt=\"IVECO\"]')?.naturalWidth > 0");
      assert(await evaluate("document.body.textContent.includes('Administration IVECO')"));
      assert.equal(await evaluate("fetch('/api/admin/overview').then(r=>r.status)"), 401);
      await screenshot("iveco-branded-admin-login");
      console.log("PASS: IVECO-only rendered branding on 16 customer routes plus admin login; dynamic text/accessible labels normalized; input values, URLs, stored data and admin authorization unchanged.");
      return;
    }
    if (process.argv.includes("--iveco-vehicles")) {
      const expected = [
        ["/accueil", ".home-hero img", ["iveco-home.jpg"]],
        ["/compte", ".hero-vehicle", ["iveco-account.jpg"]],
        ["/projet", ".owned-hero", ["iveco-products.jpg"]],
        ["/retrait", ".vehicle-balance img", ["iveco-withdraw.jpg"]],
        ["/a-propos", ".reference-crop img", ["iveco-about-fleet.jpg", "iveco-about-truck.jpg"]],
        ["/service-client", ".service-banner img", ["iveco-support.jpg"]],
      ];
      const unique = new Set();
      for (const [route, selector, filenames] of expected) {
        await navigate(route);
        await waitFor(`(() => { const images=[...document.querySelectorAll(${JSON.stringify(selector)})]; return images.length===${filenames.length} && images.every(img=>img.complete && img.naturalWidth>0); })()`);
        assert.deepEqual(await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(img=>img.getAttribute('src').split('/').pop())`), filenames);
        for (const name of filenames) { assert(!unique.has(name)); unique.add(name); }
        assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${route} must fit the viewport`);
        if (route === "/accueil") {
          await waitFor("document.querySelector('.platform-notification-dialog[open] [data-notification-close]')");
          await evaluate("document.querySelector('.platform-notification-dialog[open] [data-notification-close]').click()");
          await waitFor("[...document.querySelectorAll('.vehicle-image img')].length===6 && [...document.querySelectorAll('.vehicle-image img')].every(img=>img.complete && img.naturalWidth>0)");
          assert.deepEqual(await evaluate("[...document.querySelectorAll('.vehicle-image img')].map(img=>img.getAttribute('src').split('/').pop())"), Array.from({length:6},(_,i)=>`iveco-vip-${i+1}.jpg`));
          await screenshot("iveco-vehicles-home");
          await evaluate("document.querySelector('[data-purpose=\"vip-card-4\"] [data-purpose=\"buy-btn\"]').click()");
          await waitFor("document.querySelector('.purchase-details img').getAttribute('src').endsWith('iveco-vip-4.jpg') && document.querySelector('.purchase-details img').naturalWidth>0");
          await screenshot("iveco-vehicles-purchase");
        } else {
          await screenshot("iveco-vehicles-" + route.slice(1));
        }
      }
      console.log("PASS: 13 distinct IVECO photos, six loaded VIP images, matching purchase-dialog image, account/products/withdrawal/About/support routes, no overflow. No purchase or payment submitted.");
      return;
    }
    if (process.argv.includes("--catalog-loading")) {
      await require("./catalog-loading-browser.cjs")({ call, evaluate, waitFor, navigate, screenshot, paused });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--home-branding")) {
      for (const width of [320, 390, 472]) {
        await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
        await navigate("/accueil");
        await waitFor("document.querySelector('[data-purpose=\"logo-container\"] img')?.naturalWidth > 0");
        assert.equal(await evaluate("document.querySelector('[data-purpose=\"logo-container\"] img').getAttribute('alt')"), "IVECO");
        assert(!await evaluate("/SHINERAY/i.test(document.querySelector('.home-header').textContent)"));
        assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `Header must fit ${width}px`);
        assert(await evaluate("(() => { const title=document.querySelector('.home-header h1').getBoundingClientRect(), logo=document.querySelector('[data-purpose=\"logo-container\"]').getBoundingClientRect(); return title.right <= logo.left && logo.right <= innerWidth; })()"));
        if (width === 390) await screenshot("iveco-home-logo-mobile");
      }
      console.log("PASS: signed-in home uses the supplied IVECO logo, loaded image, accessible name, no overlapping title or horizontal overflow at 320/390/472px.");
      return;
    }
    if (process.argv.includes("--history-links")) {
      for (const [source, destination] of [
        ["/recharger", "/historique-recharges"],
        ["/retrait", "/historique-retraits"],
      ]) {
        await navigate(source);
        assert.equal(await evaluate("document.querySelector('[data-history-link]').getAttribute('href')"), destination);
        await evaluate("document.querySelector('[data-history-link]').click()");
        await waitFor(`location.pathname===${JSON.stringify(destination)} &&
          document.readyState==='complete' &&
          !document.documentElement.classList.contains('site-navigation-pending') &&
          document.querySelector('[data-activity-list]')?.getAttribute('aria-busy')==='false'`);
        assert.equal(await evaluate("Boolean(document.querySelector('dialog[open]'))"), false);
        assert.equal(await evaluate("document.body.inert"), false);
      }
      assert.deepEqual(errors, []);
      console.log("PASS: both header i links open their matching real history page, with loader completion and no information dialog.");
      return;
    }
    if (process.argv.includes("--navigation-loading")) {
      await require("./navigation-loading-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, paused, base,
      });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--about-loading")) {
      await require("./about-loading-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, paused, base,
      });
      return;
    }
    if (process.argv.includes("--team-copy")) {
      await require("./team-copy-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, base,
      });
      return;
    }
    if (process.argv.includes("--team-avatar")) {
      const script = await call("Page.addScriptToEvaluateOnNewDocument", { source: `
        const originalFetch = window.fetch.bind(window);
        window.fetch = (url, options) => String(url) === '/api/team'
          ? Promise.resolve(new Response(JSON.stringify({
              levels:[1,0,0],total:1,revenue_fcfa:0,
              level_revenue_fcfa:[0,0,0],referral_percentages:[40,2,1],
              members:[{level:1,phone_masked:'32****282',created_at:'2026-10-20T06:59:13Z',deposits_fcfa:0}]
            }),{headers:{'Content-Type':'application/json'}}))
          : originalFetch(url, options);
      ` });
      try {
        await call("Emulation.setDeviceMetricsOverride", { width:390,height:844,deviceScaleFactor:1,mobile:true });
        await navigate("/mon-equipe");
        await waitFor("document.querySelector('.team-member-avatar')?.naturalWidth > 0");
        assert.equal(await evaluate("document.querySelector('.team-member-avatar').getAttribute('src')"), "/pages/assets/iveco-auth-logo.png");
        assert.equal(await evaluate("document.querySelector('.team-member-avatar').alt"), "IVECO");
        assert(await evaluate("document.querySelector('[data-team-members]').innerText.includes('32****282')"));
        assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
        await screenshot("team-iveco-avatar");
        console.log("PASS: IVECO member logo loaded, phone/amount preserved, no mobile overflow.");
      } finally {
        await call("Page.removeScriptToEvaluateOnNewDocument", { identifier:script.identifier });
      }
      return;
    }
    if (process.argv.includes("--account-copy")) {
      await require("./account-copy-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, base,
      });
      return;
    }
    if (process.argv.includes("--rules-banner")) {
      await navigate("/regles");
      await waitFor("document.querySelector('.rules-pack-banner')?.complete && document.querySelector('.rules-pack-banner').naturalWidth > 0");
      for (const width of [320, 390, 1360]) {
        await call("Emulation.setDeviceMetricsOverride", {
          width, height: 844, deviceScaleFactor: 1, mobile: width < 500,
        });
        assert(await evaluate(`(() => {
          const image = document.querySelector(".rules-pack-banner");
          const rect = image.getBoundingClientRect();
          const text = document.querySelector(".rules-content .reference-copy").getBoundingClientRect();
          return rect.bottom < text.top && rect.width > 0 &&
            Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight) < .01 &&
            document.documentElement.scrollWidth <= innerWidth;
        })()`));
      }
      await call("Emulation.setDeviceMetricsOverride", {
        width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
      });
      await screenshot("rules-pack-banner");
      console.log("PASS: supplied image loads above rules, uncropped at mobile and desktop widths.");
      return;
    }
    if (process.argv.includes("--wallet-operators")) {
      await require("./wallet-operators-browser.cjs")({
        userId, evaluate, navigate, waitFor, screenshot,
      });
      return;
    }
    if (process.argv.includes("--withdrawal")) {
      await require("./withdrawal-browser.cjs")({
        userId, evaluate, navigate, waitFor, screenshot,
      });
      return;
    }
    if (process.argv.includes("--payment-mixed")) {
      await require("./payment-mixed-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, paused,
      });
      return;
    }
    if (process.argv.includes("--payment-back")) {
      await evaluate(`sessionStorage.setItem("shineray-deposit-draft", JSON.stringify({
        amount_fcfa: 40000, channel: 1, created_at: Date.now()
      }))`);
      await navigate("/choisir-operateur");
      await waitFor("document.querySelector('.iveco-payment-back')");
      for (const width of [320, 390]) {
        await call("Emulation.setDeviceMetricsOverride", {
          width, height: 844, deviceScaleFactor: 1, mobile: true,
        });
        assert(await evaluate(`(() => {
          const back = document.querySelector(".iveco-payment-back");
          const rect = back.getBoundingClientRect();
          const brand = document.querySelector(".iveco-scene-brand").getBoundingClientRect();
          return back.getAttribute("href") === "/recharger" &&
            rect.height >= 44 && rect.bottom <= brand.top &&
            document.documentElement.scrollWidth <= innerWidth;
        })()`));
      }
      await screenshot("payment-back-arrow");
      await evaluate("document.querySelector('.iveco-payment-back').click()");
      await waitFor("location.pathname === '/recharger'");
      assert(await evaluate(`JSON.parse(sessionStorage.getItem("shineray-deposit-draft")).amount_fcfa === 40000`));
      console.log("PASS: visible mobile back arrow, no logo overlap or overflow, returns to recharge and preserves draft.");
      return;
    }
    if (process.argv.includes("--history-copy")) {
      await require("./history-copy-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, paused, base,
      });
      return;
    }
    if (process.argv.includes("--filled-records")) {
      await require("./filled-records-browser.cjs")({
        call, evaluate, waitFor, navigate, screenshot, paused, base,
        owner: registration.body.user, loginPayload: payload,
        trackChild: id => childUserIds.push(id),
      });
      assert.deepEqual(errors, []);
      return;
    }
    if (process.argv.includes("--member-pages")) {
      async function noOverflow() {
        assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
      }
      for (const [route, name] of [
        ["/financement", "finance"], ["/historique-recharges", "recharge-history"],
        ["/historique-retraits", "withdraw-history"], ["/gestion-compte-bancaire", "wallet-empty"],
      ]) {
        await navigate(route);
        await waitFor("!document.querySelector('[aria-busy=\"true\"]')");
        await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
        await noOverflow();
        const text = await evaluate("document.body.innerText");
        assert(!text.includes("2,200") && !text.includes("2 200") && !text.includes("Bonus d'inscription"));
        await screenshot(`shineray-${name}-reference`);
      }
      await navigate("/ajouter-compte-retrait");
      assert.equal(await evaluate("document.querySelector('[name=holder_name]').required"), true);
      assert.equal(await evaluate("document.querySelector('[data-wallet-form]').checkValidity()"), false);
      await noOverflow();
      await screenshot("shineray-wallet-form-reference");
      await evaluate(`(() => {
        const form=document.querySelector('[data-wallet-form]');
        form.elements.provider.value='TOGOCEL';
        form.elements.holder_name.value='Titulaire de test';
        form.elements.phone.value=${JSON.stringify(phone)};
        form.requestSubmit();
      })()`);
      await waitFor("location.pathname==='/gestion-compte-bancaire'");
      await waitFor("Boolean(document.querySelector('.wallet-list-row'))");
      assert(await evaluate("document.querySelector('[data-wallet-list]').innerText.includes('Titulaire de test')"));
      assert.equal(await evaluate("document.querySelector('[data-wallet-empty]').hidden"), true);
      await screenshot("shineray-wallet-populated-reference");
      const storedWallet = await evaluate("fetch('/api/wallets').then(r=>r.json())");
      assert.equal(storedWallet.wallets[0].holder_name, "Titulaire de test");
      await evaluate("document.querySelector('[data-wallet-list] button').click()");
      await waitFor("document.querySelector('[data-wallet-list]').children.length===0");
      assert.equal(await evaluate("document.querySelector('[data-wallet-empty]').hidden"), false);
      assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-wallet-empty]')).display"), "flex");
      await navigate("/a-propos");
      await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
      await noOverflow();
      assert(await evaluate("document.body.innerText.includes('600615.SH')"));
      await screenshot("shineray-about-reference");
      await evaluate("scrollTo(0,document.body.scrollHeight)");
      await screenshot("shineray-about-scrolled-reference");
      await navigate("/equipe");
      await waitFor("/^[A-Z0-9]{8,10}$/.test(document.querySelector('[data-referral-code]').textContent.trim())");
      const ownCode = await evaluate("document.querySelector('[data-referral-code]').textContent.trim()");
      const inviteLink = await evaluate("document.querySelector('[data-referral-link]').textContent.trim()");
      assert(inviteLink.includes(`/inscription?c=${ownCode}`));
      await noOverflow();
      await screenshot("shineray-team-reference");
      await evaluate("document.querySelector('[data-copy-value=\"code\"]').click()");
      await waitFor("document.querySelector('[data-team-status]').textContent.trim().length>0");
      assert(await evaluate("document.querySelector('[data-team-status]').textContent.includes('Copi')"));
      await navigate("/mon-equipe");
      await waitFor("!document.querySelector('[data-team-detail-empty]').hidden");
      await screenshot("shineray-team-detail-reference");
      for (const level of ["2", "3", "1"]) {
        await evaluate(`document.querySelector('[data-team-level-tab="${level}"]').click()`);
        assert.equal(await evaluate(`document.querySelector('[data-team-level-tab="${level}"]').getAttribute('aria-selected')`), "true");
        assert.equal(await evaluate("document.querySelector('[data-team-members]').children.length"), 0);
      }
      const childPhone = "9" + String(randomInt(1000000, 9999999));
      const child = await evaluate(`fetch('/api/auth/register',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          country_code:'+228',phone:${JSON.stringify(childPhone)},password:'reference-browser-test-password',
          referral_code:${JSON.stringify(ownCode)}
        })}).then(async r=>({status:r.status,body:await r.json()}))`);
      assert.equal(child.status, 201, JSON.stringify(child));
      childUserIds.push(child.body.user.id);
      execFileSync("python3", ["-c", [
        "import sys, uuid, auth_backend",
        "with auth_backend.connect() as conn, conn.cursor() as cur:",
        " cur.execute(\"INSERT INTO shineray_transactions (user_id,kind,label,amount_fcfa,provider_reference,details) VALUES (%s,'recharge','Dépôt validé de test',1500,%s,'{}')\", (int(sys.argv[1]), 'team-browser-' + str(uuid.uuid4())))",
      ].join("\n"), String(child.body.user.id)]);
      const login = await evaluate(`fetch('/api/auth/login',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(payload)})
      }).then(r=>r.status)`);
      assert.equal(login, 200);
      await navigate("/mon-equipe");
      await waitFor("document.querySelector('[data-team-members]').children.length===1");
      assert.equal(await evaluate("document.querySelector('[data-team-level-count=\"1\"]').textContent"), "1");
      assert.equal(await evaluate("document.querySelector('[data-team-detail-empty]').hidden"), true);
      assert.equal(await evaluate("document.querySelector('.team-member-investment').textContent"), "1,500");
      assert(await evaluate("document.querySelector('.team-member-investment').getAttribute('aria-label').includes('Dépôts validés')"));
      await screenshot("shineray-team-deposits-reference");
      assert(await evaluate("document.querySelector('[data-team-members]').innerText.includes('****')"));
      assert.equal(await evaluate(`document.querySelector('[data-team-members]').innerText.includes(${JSON.stringify(childPhone)})`), false);
      await evaluate("document.querySelector('[data-team-level-tab=\"2\"]').click()");
      assert.equal(await evaluate("document.querySelector('[data-team-members]').children.length"), 0);
      assert.equal(await evaluate("document.querySelector('[data-team-detail-empty]').hidden"), false);
      await call("Emulation.setDeviceMetricsOverride", { width:390,height:744,deviceScaleFactor:1,mobile:true });
      for (const route of ["/financement","/historique-recharges","/historique-retraits",
        "/gestion-compte-bancaire","/ajouter-compte-retrait","/a-propos","/equipe","/mon-equipe"]) {
        await navigate(route);
        await noOverflow();
      }
      assert.deepEqual(errors, []);
      console.log("PASS: reference member pages, real empty histories, required wallet name persisted and deleted through UI, full About, personal invitation/copy, real referral member masked and filtered, two mobile widths.");
      return;
    }
    if (process.argv.includes("--reference-pages")) {
      const clickText = text => evaluate(`(() => {
        const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});
        if(!button) throw new Error('Missing button: '+${JSON.stringify(text)});
        button.click();
      })()`);
      const noOverflow = async () => assert.equal(
        await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
      const imagesLoaded = async () => {
        await waitFor("[...document.images].every(image=>image.complete)");
        assert(await evaluate("[...document.images].every(image=>image.naturalWidth>0)"), "Broken vehicle photo");
      };
      await imagesLoaded();
      await noOverflow();
      assert.equal(await evaluate("document.querySelectorAll('[data-purpose=\"buy-btn\"]').length"), 6);
      assert.equal(await evaluate("Boolean([...document.scripts].find(s=>s.src.includes('tailwind')))"), false);
      await screenshot("shineray-home-reference");
      await evaluate("document.querySelector('[data-purpose=\"buy-btn\"]').click()");
      await waitFor("Boolean(document.querySelector('dialog[open]'))");
      await screenshot("shineray-purchase-reference");
      await clickText("Annuler");
      assert.equal(await evaluate("Boolean(document.querySelector('dialog[open]'))"), false);
      await evaluate("document.querySelector('[data-purpose=\"buy-btn\"]').click()");
      await clickText("Confirmer");
      await waitFor("document.querySelector('.purchase-error').textContent.includes('Solde insuffisant')");
      assert.deepEqual(paymentResponses, []);
      await navigate("/recharger");
      assert.equal(await evaluate("document.querySelectorAll('[data-amount-choice]').length"), 9);
      await noOverflow();
      await screenshot("shineray-recharge-reference");
      assert.equal(await evaluate("document.querySelector('[data-history-link]').getAttribute('href')"), "/historique-recharges");
      await evaluate("document.querySelector('[data-amount-choice=\"12000\"]').click()");
      assert.equal(await evaluate("document.querySelector('#amount').value"), "12000");
      await evaluate("document.querySelector('[data-channel-choice=\"1\"]').click()");
      assert.equal(await evaluate("document.querySelector('[data-channel-choice=\"1\"]').getAttribute('aria-pressed')"), "true");
      await clickText("Rechargez maintenant");
      await waitFor("location.pathname==='/choisir-operateur' && document.querySelector('[data-deposit-amount]')?.textContent==='FCFA 12,000'");
      assert.deepEqual(paymentResponses, []);
      assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('shineray-deposit-draft')).channel"), 1);
      await navigate("/recharger");
      await evaluate("window.scrollTo(0,document.body.scrollHeight)");
      await screenshot("shineray-recharge-instructions-reference");
      await navigate("/retrait");
      await imagesLoaded();
      await waitFor("document.querySelector('[data-account-balance]')?.textContent.includes('0')");
      await noOverflow();
      await screenshot("shineray-withdraw-reference");
      await evaluate("document.querySelector('#amount').value='10000';document.querySelector('#amount').dispatchEvent(new Event('input',{bubbles:true}))");
      assert(await evaluate("/7[\\s,.]?800/.test(document.body.innerText)"), "22% reference fee preview should update");
      await evaluate("window.scrollTo(0,document.body.scrollHeight)");
      await screenshot("shineray-withdraw-instructions-reference");
      await evaluate("document.querySelector('[data-wallet-select]').click()");
      await waitFor("document.querySelector('[data-wallet-options]').innerText.includes('Aucun compte')");
      assert.equal(await evaluate("document.querySelector('[data-wallet-options] a').getAttribute('href')"), "/ajouter-compte-retrait");
      const walletResponse = await evaluate(`fetch('/api/wallets', {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({provider:'TOGOCEL',phone:${JSON.stringify(phone)},holder_name:'Titulaire de test'})
      }).then(async r=>({status:r.status,body:await r.json()}))`);
      assert.equal(walletResponse.status, 201, JSON.stringify(walletResponse));
      await navigate("/retrait");
      await waitFor("document.querySelectorAll('[data-wallet-options] button').length===1");
      await evaluate("document.querySelector('[data-wallet-select]').click();document.querySelector('[data-wallet-options] button').click()");
      assert.equal(await evaluate("Number(document.querySelector('[data-payment-action]').dataset.walletId)"), walletResponse.body.wallet.id);
      await evaluate("document.querySelector('#amount').value='2200';document.querySelector('#amount').dispatchEvent(new Event('input',{bubbles:true}))");
      await clickText("Retirer de l'argent maintenant");
      await waitFor("document.body.innerText.includes('Aucun montant n’a été débité ou crédité.')");
      assert.deepEqual(paymentResponses, [503]);
      assert.equal(paymentRequests[0].wallet_id, walletResponse.body.wallet.id);
      await navigate("/service-client");
      await imagesLoaded();
      await noOverflow();
      await screenshot("shineray-support-reference");
      assert.equal(await evaluate("document.querySelector('[data-contact]').href"), "https://t.me/Ivecoservice");
      await call("Emulation.setDeviceMetricsOverride", {
        width: 390, height: 744, deviceScaleFactor: 1, mobile: true,
      });
      for (const route of ["/accueil", "/recharger", "/retrait", "/service-client"]) {
        await navigate(route);
        if (route === "/accueil") {
          await waitFor("Boolean(document.querySelector('dialog[open]'))");
          await evaluate("document.querySelector('[data-notification-close]').click()");
          await evaluate("document.querySelector('[data-purpose=\"buy-btn\"]').click()");
          assert(await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight})()"));
        }
        await noOverflow();
      }
      assert.deepEqual(errors, []);
      const currentUser = await evaluate("fetch('/api/me').then(r=>r.json())");
      assert.equal(currentUser.balance_fcfa, 2300, "Reference actions must not change the welcome bonus");
      console.log("PASS: reference home, purchase dialog cancel/insufficient balance, recharge presets, withdrawal real balance/fee preview, support photos, no overflow at472/390, no fake funds.");
      console.log("Screenshots: /tmp/shineray-{home,purchase,recharge,withdraw,support}-reference.png");
      return;
    }
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
    fixtureServer?.kill("SIGTERM");
    if (Number.isSafeInteger(userId)) {
      execFileSync("python3", ["-c", [
        "import sys, json, auth_backend",
        "with auth_backend.connect() as conn, conn.cursor() as cur:",
        " ids=json.loads(sys.argv[1])",
        " cur.execute('DELETE FROM shineray_sonarapay_orders WHERE user_id=ANY(%s)', (ids,))",
        " cur.execute('DELETE FROM shineray_admin_vip_grants WHERE admin_id=ANY(%s) OR user_id=ANY(%s)', (ids,ids))",
        " cur.execute(\"DELETE FROM shineray_admin_resources WHERE id IN (SELECT (details->>'id')::bigint FROM shineray_admin_audit WHERE (admin_id=ANY(%s) OR details->>'test_fixture'=%s) AND event_type LIKE 'create_%%')\", (ids,sys.argv[2]))",
        " cur.execute('DELETE FROM shineray_admin_operations WHERE admin_id=ANY(%s) OR user_id=ANY(%s)', (ids,ids))",
        " cur.execute(\"DELETE FROM shineray_admin_audit WHERE admin_id=ANY(%s) OR details->>'test_fixture'=%s\", (ids,sys.argv[2]))",
        " cur.execute('DELETE FROM shineray_first_deposits WHERE user_id = ANY(%s)', (ids,))",
        " cur.execute('DELETE FROM shineray_deposit_approvals WHERE user_id = ANY(%s)', (ids,))",
        " for user_id in json.loads(sys.argv[1]):",
        "  cur.execute('DELETE FROM shineray_transactions WHERE user_id = %s', (user_id,))",
        "  cur.execute('DELETE FROM shineray_users WHERE id = %s', (user_id,))",
      ].join("\n"), JSON.stringify([...childUserIds.reverse(), userId]), adminFixture], { stdio: "inherit" });
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    if (paymentFixtureIds.length) {
      execFileSync("python3", ["-c",
        "import auth_backend,json,sys\nwith auth_backend.connect() as conn, conn.cursor() as cur:\n cur.execute('DELETE FROM shineray_admin_resources WHERE id=ANY(%s)',(json.loads(sys.argv[1]),))",
        JSON.stringify(paymentFixtureIds)]);
    }
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

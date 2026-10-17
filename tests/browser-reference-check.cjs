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
  const childUserIds = [];
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
      await waitFor(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(path)}`);
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
      const login = await evaluate(`fetch('/api/auth/login',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(payload)})
      }).then(r=>r.status)`);
      assert.equal(login, 200);
      await navigate("/mon-equipe");
      await waitFor("document.querySelector('[data-team-members]').children.length===1");
      assert.equal(await evaluate("document.querySelector('[data-team-level-count=\"1\"]').textContent"), "1");
      assert.equal(await evaluate("document.querySelector('[data-team-detail-empty]').hidden"), true);
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
      await waitFor("document.body.innerText.includes('Aucun montant n’a été débité ou crédité.')");
      assert.deepEqual(paymentResponses, [503]);
      await navigate("/recharger");
      assert.equal(await evaluate("document.querySelectorAll('[data-amount-choice]').length"), 6);
      await noOverflow();
      await screenshot("shineray-recharge-reference");
      await evaluate("document.querySelector('[data-info-open]').click()");
      assert(await evaluate("Boolean(document.querySelector('#reference-info[open]'))"));
      await evaluate("document.querySelector('[data-info-close]').click()");
      await evaluate("document.querySelector('[data-amount-choice=\"8000\"]').click()");
      assert.equal(await evaluate("document.querySelector('#amount').value"), "8000");
      await evaluate("document.querySelector('[data-channel-choice=\"1\"]').click()");
      assert.equal(await evaluate("document.querySelector('[data-channel-choice=\"1\"]').getAttribute('aria-pressed')"), "true");
      await clickText("Rechargez maintenant");
      await waitFor("document.body.innerText.includes('Aucun montant n’a été débité ou crédité.')");
      assert.deepEqual(paymentResponses, [503, 503]);
      assert.equal(String(paymentRequests[1].channel), "1");
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
      assert.deepEqual(paymentResponses, [503, 503, 503]);
      assert.equal(paymentRequests[2].wallet_id, walletResponse.body.wallet.id);
      await navigate("/service-client");
      await imagesLoaded();
      await noOverflow();
      await screenshot("shineray-support-reference");
      await evaluate("document.querySelector('[data-contact]').click()");
      assert(await evaluate("Boolean(document.querySelector('dialog[open]'))"));
      assert(await evaluate("document.querySelector('dialog[open]').innerText.includes('configur')"));
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
      assert.equal(currentUser.balance_fcfa, 0, "Reference actions must not change real funds");
      console.log("PASS: reference home, purchase dialog cancel/real provider failure, recharge presets/failure, withdrawal real balance/fee preview, support photos, no overflow at472/390, no fake funds.");
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
    if (Number.isSafeInteger(userId)) {
      execFileSync("python3", ["-c", [
        "import sys, json, auth_backend",
        "with auth_backend.connect() as conn, conn.cursor() as cur:",
        " for user_id in json.loads(sys.argv[1]):",
        "  cur.execute('DELETE FROM shineray_transactions WHERE user_id = %s', (user_id,))",
        "  cur.execute('DELETE FROM shineray_users WHERE id = %s', (user_id,))",
      ].join("\n"), JSON.stringify([...childUserIds.reverse(), userId])], { stdio: "inherit" });
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

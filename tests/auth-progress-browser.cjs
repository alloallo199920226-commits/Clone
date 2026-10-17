const assert = require("node:assert/strict");
const { randomInt } = require("node:crypto");

module.exports = async function checkAuthProgress({
  call, evaluate, waitFor, navigate, screenshot, paused, base, trackUser,
}) {
  const phone = "9" + String(randomInt(1000000, 9999999));
  const password = "auth-progress-test-password";
  const visible = "!document.querySelector('.auth-submit-loading').hidden";
  const patterns = ["/api/auth/register", "/api/auth/login", "/api/me"].map(path => ({
    urlPattern: base + path, requestStage: "Request",
  }));
  async function intercept() {
    paused.clear();
    await call("Fetch.enable", { patterns });
  }
  async function waitPaused(path) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (paused.has(path)) return paused.get(path);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Authentication request did not pause: ${path}`);
  }
  async function resume(path) {
    const requestId = await waitPaused(path);
    paused.delete(path);
    await call("Fetch.continueRequest", { requestId });
  }
  async function fillForm(signup) {
    await evaluate(`(() => {
      const form=document.querySelector('[data-auth-form]');
      form.elements.country.value='+228';
      document.querySelector('[data-country-label]').textContent='+228 Togo >>';
      form.elements.phone.value=${JSON.stringify(phone)};
      form.elements.password.value=${JSON.stringify(password)};
      ${signup ? `form.elements['password-confirm'].value=${JSON.stringify(password)};
        form.elements['password-confirm'].dispatchEvent(new Event('input'));` : ""}
    })()`);
  }
  async function submit() {
    await evaluate("document.querySelector('[data-auth-form]').requestSubmit()");
  }
  async function assertPending(path) {
    await waitFor(visible);
    assert.equal(await evaluate("location.pathname"), path);
    assert.equal(await evaluate("document.querySelector('[data-auth-form]').getAttribute('aria-busy')"), "true");
    assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), true);
    const geometry = await evaluate(`(() => {
      const r=document.querySelector('.auth-submit-dots').getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,
        count:document.querySelectorAll('.auth-submit-dots i').length,iw:innerWidth,ih:innerHeight};
    })()`);
    assert.equal(geometry.count, 3);
    assert.equal(geometry.w, 54);
    assert(Math.abs(geometry.x - geometry.iw / 2) < 2);
    assert(Math.abs(geometry.y - geometry.ih / 2) < 6);
  }
  await navigate("/inscription");
  assert.equal(await evaluate(visible), false);
  await fillForm(true);
  // Observe the real response to clean up the temporary account even on failure.
  await evaluate(`(() => {
    const original=window.fetch;
    window.__authSubmitCount=0;
    window.fetch=async (...args) => {
      const promise=original(...args);
      if(args[0]==='/api/auth/register') {
        window.__authSubmitCount++;
        const response=await promise;
        if(response.status===201) window.__createdAuthUser=(await response.clone().json()).user.id;
        return response;
      }
      return promise;
    };
  })()`);
  await intercept();
  await submit();
  await waitPaused("/api/auth/register");
  await assertPending("/inscription");
  await screenshot("shineray-signup-orange-pending");
  await evaluate("document.querySelector('[data-auth-form]').dispatchEvent(new Event('submit',{cancelable:true}))");
  assert.equal(await evaluate("window.__authSubmitCount"), 1);
  await resume("/api/auth/register");
  await waitFor("Number.isSafeInteger(window.__createdAuthUser)");
  trackUser(await evaluate("window.__createdAuthUser"));
  await waitPaused("/api/me");
  await assertPending("/inscription");
  await resume("/api/me");
  await waitFor("location.pathname==='/accueil'");
  await call("Fetch.disable");
  assert.equal(await evaluate("fetch('/api/auth/logout',{method:'POST'}).then(r=>r.status)"), 200);
  await navigate("/connexion");
  await fillForm(false);
  await intercept();
  await submit();
  const failedRequest = await waitPaused("/api/auth/login");
  await assertPending("/connexion");
  await call("Fetch.fulfillRequest", {
    requestId: failedRequest, responseCode: 503,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify({ error: "Service indisponible pour ce test." })).toString("base64"),
  });
  await waitFor("document.querySelector('.auth-submit-loading').hidden");
  assert.equal(await evaluate("location.pathname"), "/connexion");
  assert.equal(await evaluate("document.querySelector('[data-auth-form]').inert"), false);
  assert(await evaluate("document.querySelector('.demo-notice').textContent.includes('Service indisponible')"));
  await call("Fetch.disable");
  await call("Network.emulateNetworkConditions", {
    offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  await submit();
  await waitFor("document.querySelector('.demo-notice').textContent.includes('Internet')");
  assert.equal(await evaluate(visible), false);
  await call("Network.emulateNetworkConditions", {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  // Shorten only the browser-test deadline; do not fake authentication success.
  await evaluate(`window.__originalAuthTimeout=window.setTimeout;
    window.setTimeout=(fn,delay,...args)=>window.__originalAuthTimeout(fn,delay===45000?250:delay,...args)`);
  await intercept();
  await submit();
  await waitFor("document.querySelector('.demo-notice').textContent.includes('trop de temps')");
  assert.equal(await evaluate(visible), false);
  assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), false);
  await call("Fetch.disable");
  await evaluate("window.setTimeout=window.__originalAuthTimeout");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 744, deviceScaleFactor: 1, mobile: true,
  });
  await intercept();
  await submit();
  await waitPaused("/api/auth/login");
  await assertPending("/connexion");
  await screenshot("shineray-login-orange-pending");
  await resume("/api/auth/login");
  await waitPaused("/api/me");
  await assertPending("/connexion");
  await resume("/api/me");
  await waitFor("location.pathname==='/accueil'");
  await call("Fetch.disable");
  await waitFor("document.readyState==='complete'");
  assert.equal(await evaluate("fetch('/api/me').then(r=>r.status)"), 200);
  console.log("PASS: orange dots at 472/390px, held registration/login/session verification, duplicate prevention, real authentication and home navigation, server error/offline/timeout recovery.");
};

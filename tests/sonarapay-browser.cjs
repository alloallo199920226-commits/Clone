const assert = require("node:assert/strict");
module.exports = async ({ call, evaluate, navigate, waitFor, screenshot, phone, prefix = "+229" }) => {
  const operatorCount = prefix === "+226" ? 3 : 2;
  const balance = () => evaluate("(async () => (await (await fetch('/api/me')).json()).balance_fcfa)()");
  const noProviderBrand = async () => assert(!await evaluate("/sonarapay/i.test(document.body.innerText + ' ' + Array.from(document.querySelectorAll('[aria-label]'), node => node.getAttribute('aria-label')).join(' '))"), "Provider name must not be displayed");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/recharger");
  await evaluate(`sessionStorage.setItem('shineray-deposit-draft', JSON.stringify({
    amount_fcfa:500,channel:1,created_at:Date.now()
  }))`);
  await navigate("/choisir-operateur");
  await waitFor(`document.querySelectorAll('[data-operator]').length === ${operatorCount}`);
  await noProviderBrand();
  assert.equal(await evaluate("document.querySelector('[data-deposit-prefix]').textContent"), prefix);
  if (prefix === "+226") {
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-operator]')].map(node=>node.dataset.operator)"),
      ["orange_bf", "moov_bf", "telecel_bf"]);
  }
  assert.match(await evaluate("document.querySelector('[data-notice-body]').textContent"), /réelle/);
  await screenshot("sonarapay-operators");
  // The operator has accepted the request, but Safari loses its response.
  // While GET recovery is also offline, do not offer another payment submission.
  await evaluate(`window.paymentFetch = window.fetch; window.paymentPosts = 0;
    window.fetch = async (url, options) => {
      if (String(url) === '/api/sonarapay/payments') {
        if (options?.method === 'POST') {
          window.paymentPosts++;
          await window.paymentFetch(url, options);
        }
        throw new TypeError('Load failed');
      }
      return window.paymentFetch(url, options);
    }`);
  await evaluate(`document.querySelector('#deposit-phone').value=${JSON.stringify(phone)};
    document.querySelector('#deposit-operator-form').requestSubmit()`);
  await waitFor("document.querySelector('[type=submit]').textContent.includes('Vérifier mon paiement')");
  assert.match(await evaluate("document.querySelector('[data-deposit-status]').textContent"), /Ne payez pas une seconde fois/);
  assert(!await evaluate("document.body.innerText.includes('Load failed')"));
  await evaluate("document.querySelector('#deposit-operator-form').requestSubmit()");
  await waitFor("!document.querySelector('[type=submit]').disabled");
  assert.equal(await evaluate("window.paymentPosts"), 1, "Retry after a lost response must be GET-only");
  await screenshot("sonarapay-connection-lost");
  // Reload with connectivity restored: persisted request ID recovers automatically.
  await navigate("/choisir-operateur");
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
  assert.equal(await evaluate("document.querySelector('[data-sonara-success]').hidden"), true);
  await noProviderBrand();
  assert.equal(await balance(), 2300);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.deposit-details')).display"), "none");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.deposit-ussd-card')).display"), "none");
  const paymentPath = await evaluate("location.pathname + location.search");
  assert.match(paymentPath, /confirmation-depot\?payment=/);
  assert.equal(await evaluate("document.querySelector('[data-sonara-redirect]').hidden"), true);
  await new Promise(resolve => setTimeout(resolve, 11000));
  assert.equal(await evaluate("location.pathname + location.search"), paymentPath, "Pending payments must not redirect");
  await screenshot("sonarapay-pending");
  await navigate("/historique-recharges");
  await waitFor("document.querySelector('a[href*=\"confirmation-depot?payment=\"]')");
  assert.match(await evaluate("document.querySelector('[data-activity-list]').textContent"), /Recharge en cours/);
  await noProviderBrand();
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'successful'})})`);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  const successSeenAt = Date.now();
  assert.equal(await evaluate("document.querySelector('[data-sonara-redirect]').hidden"), false);
  assert.match(await evaluate("document.querySelector('[data-sonara-redirect]').textContent"), /accueil.*10 s/);
  await noProviderBrand();
  assert.equal(await balance(), 2800);
  assert.equal(await evaluate("document.querySelector('[data-sonara-success]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-sonara-success] h1').textContent"), "Paiement effectué avec succès");
  assert.match(await evaluate("document.querySelector('[data-deposit-clock]').textContent"), /^\d{2}:\d{2}$/);
  const origin = await evaluate("location.origin");
  await call("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  const actualReference = await evaluate("document.querySelector('[data-sonara-reference]').textContent");
  await call("Page.bringToFront");
  await call("Runtime.evaluate", { expression: "document.querySelector('[data-sonara-copy]').click()", userGesture: true });
  await waitFor("document.querySelector('[data-sonara-copy]').classList.contains('is-copied')");
  assert.equal(await evaluate("navigator.clipboard.readText()"), actualReference);
  await evaluate("document.querySelector('[data-deposit-language]').click()");
  assert.equal(await evaluate("document.querySelector('[data-sonara-success] h1').textContent"), "Payment completed successfully");
  await noProviderBrand();
  await evaluate("document.querySelector('[data-deposit-language]').click()");
  await call("Emulation.setDeviceMetricsOverride", { width: 472, height: 802, deviceScaleFactor: 1, mobile: true });
  await screenshot("sonarapay-success");
  console.log("Success geometry:", await evaluate(`JSON.stringify(Object.fromEntries(
    ['.iveco-signature-hero','.deposit-card','.deposit-confirmation-header','.sonara-success','.deposit-payer-card'].map(selector => {
      const r=document.querySelector(selector).getBoundingClientRect();return [selector,{x:r.x,y:r.y,width:r.width,height:r.height}];
    })))`));
  await waitFor("location.pathname === '/accueil'");
  assert(Date.now() - successSeenAt >= 9700, "Success redirect must wait 10 seconds, not redirect early");
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  await evaluate("document.querySelector('.sonara-history-button').click()");
  await waitFor("location.pathname === '/historique-recharges'");
  await waitFor("document.querySelector('[data-activity-list]').textContent.includes('Succès')");
  await noProviderBrand();
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  assert.equal(await balance(), 2800);
  await evaluate("document.querySelector('[data-deposit-modify]').click()");
  await waitFor("location.pathname === '/choisir-operateur'");
  assert.equal(await balance(), 2800);
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  await evaluate("document.querySelector('.deposit-close').click()");
  await waitFor("location.pathname === '/recharger'");
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  for (const width of [320, 390, 472, 768]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `Overflow at ${width}px`);
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'otp'})})`);
  await evaluate(`sessionStorage.setItem('shineray-deposit-draft', JSON.stringify({
    amount_fcfa:500,channel:1,created_at:Date.now()
  }))`);
  await navigate("/choisir-operateur");
  await waitFor(`document.querySelectorAll('[data-operator]').length === ${operatorCount}`);
  await evaluate(`document.querySelector('#deposit-phone').value=${JSON.stringify(phone)};
    document.querySelector('#deposit-operator-form').requestSubmit()`);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'otp_required'");
  await noProviderBrand();
  await screenshot("sonarapay-otp");
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'otp_required'})})`);
  await evaluate("document.querySelector('#sonara-otp').value='123456';document.querySelector('#sonara-otp').form.requestSubmit()");
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
  assert.equal(await evaluate("document.querySelector('#sonara-otp').value"), "");
  assert(!await evaluate("sessionStorage.getItem('shineray-deposit-draft').includes('123456')"));
  assert.equal(await balance(), 2800);
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'failed'})})`);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'failed'");
  const failureSeenAt = Date.now();
  assert.equal(await evaluate("document.querySelector('[data-sonara-success]').hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-sonara-result-title]').textContent"), "Échec du paiement");
  assert.equal(await evaluate("document.querySelector('[data-sonara-status]').getAttribute('role')"), "alert");
  assert.equal(await evaluate("document.querySelector('[data-sonara-redirect]').hidden"), false);
  await noProviderBrand();
  assert.equal(await balance(), 2800);
  await screenshot("sonarapay-failed");
  await waitFor("location.pathname === '/accueil'");
  assert(Date.now() - failureSeenAt >= 9700, "Failure redirect must wait 10 seconds");
  assert.equal(await balance(), 2800);
  console.log("PASS: automatic success/failure detection, visible failure alert, both 10-second home redirects, no pending redirect, real account/isolated provider, exactly-once credit, OTP clearing, 4 widths. NO live provider calls.");
};

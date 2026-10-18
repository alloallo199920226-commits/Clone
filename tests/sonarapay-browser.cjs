const assert = require("node:assert/strict");
module.exports = async ({ call, evaluate, navigate, waitFor, screenshot, phone }) => {
  const balance = () => evaluate("(async () => (await (await fetch('/api/me')).json()).balance_fcfa)()");
  const noProviderBrand = async () => assert(!await evaluate("/sonarapay/i.test(document.body.innerText + ' ' + Array.from(document.querySelectorAll('[aria-label]'), node => node.getAttribute('aria-label')).join(' '))"), "Provider name must not be displayed");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/recharger");
  await evaluate(`sessionStorage.setItem('shineray-deposit-draft', JSON.stringify({
    amount_fcfa:500,channel:1,created_at:Date.now()
  }))`);
  await navigate("/choisir-operateur");
  await waitFor("document.querySelectorAll('[data-operator]').length === 2");
  await noProviderBrand();
  assert.equal(await evaluate("document.querySelector('[data-deposit-prefix]').textContent"), "+229");
  assert.match(await evaluate("document.querySelector('[data-notice-body]').textContent"), /réelle/);
  await screenshot("sonarapay-operators");
  await evaluate(`document.querySelector('#deposit-phone').value=${JSON.stringify(phone)};
    document.querySelector('#deposit-operator-form').requestSubmit()`);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
  await noProviderBrand();
  assert.equal(await balance(), 2300);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.deposit-details')).display"), "none");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.deposit-ussd-card')).display"), "none");
  const paymentPath = await evaluate("location.pathname + location.search");
  assert.match(paymentPath, /confirmation-depot\?payment=/);
  await screenshot("sonarapay-pending");
  await navigate("/historique-recharges");
  await waitFor("document.querySelector('a[href*=\"confirmation-depot?payment=\"]')");
  assert.match(await evaluate("document.querySelector('[data-activity-list]').textContent"), /Recharge en cours/);
  await noProviderBrand();
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'successful'})})`);
  await evaluate("document.querySelector('[data-sonara-check]').click()");
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  await noProviderBrand();
  assert.equal(await balance(), 2800);
  await screenshot("sonarapay-success");
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  assert.equal(await balance(), 2800);
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
  await waitFor("document.querySelectorAll('[data-operator]').length === 2");
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
  await evaluate("document.querySelector('[data-sonara-check]').click()");
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'failed'");
  await noProviderBrand();
  assert.equal(await balance(), 2800);
  console.log("PASS: Bénin-only SDK UI, real account/isolated provider, pending history, reload, exactly-once credit, OTP clearing, refusal, 4 widths. NO live provider calls.");
};

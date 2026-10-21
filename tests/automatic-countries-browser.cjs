const assert = require("node:assert/strict");
const { randomInt } = require("node:crypto");

module.exports = async ({ evaluate, navigate, waitFor, screenshot, trackUser }) => {
  const cases = [
    { prefix: "+226", phone: () => "7" + randomInt(1000000, 9999999), operators: ["orange_bf", "moov_bf", "telecel_bf"], name: "burkina" },
    { prefix: "+229", phone: () => "01" + randomInt(10000000, 99999999), operators: ["mtn_bj", "moov_bj"], name: "benin" },
    { prefix: "+228", phone: () => "9" + randomInt(1000000, 9999999), operators: ["tmoney_tg", "moov_tg"], name: "togo" },
    { prefix: "+225", phone: () => "05" + randomInt(10000000, 99999999), operators: ["orange_ci", "mtn_ci", "moov_ci"], name: "cote-ivoire" },
    { prefix: "+237", phone: () => "6" + randomInt(10000000, 99999999), operators: ["mtn_cm", "orange_cm"], name: "cameroun" },
  ];
  for (const item of cases) {
    const registration = await evaluate(`fetch('/api/auth/register', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(${JSON.stringify({ country_code: item.prefix,
        phone: item.phone(), password: "automatic-countries-test-password" })})
    }).then(async r=>({status:r.status,body:await r.json()}))`);
    assert.equal(registration.status, 201);
    trackUser(registration.body.user.id);
    await navigate("/recharger");
    await evaluate("sessionStorage.removeItem('shineray-deposit-draft');document.querySelector('#amount').value='3500';document.querySelector('[data-payment-action]').click()");
    await waitFor("location.pathname==='/choisir-operateur' && document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'");
    const href = await evaluate("location.href");
    assert.equal(new URL(href).searchParams.get("amount"), "3500");
    const configuration = await evaluate("fetch('/api/payment-channels/me').then(r=>r.json())");
    assert.equal(configuration.countryCode, item.prefix);
    assert.deepEqual(configuration.channels.filter(c => c.provider === "sonarapay").map(c => c.id), item.operators);
    if (item.prefix === "+225") {
      assert(configuration.channels.filter(c => /wave/i.test(c.operatorName)).every(c => c.provider === "manual"));
    }
    assert.equal(await evaluate("document.querySelector('[data-deposit-missing]').hidden"), true);
    assert.equal(await evaluate("document.querySelector('[data-deposit-prefix]').textContent"), item.prefix);
    for (const operator of item.operators) {
      await evaluate(`document.querySelector('[data-operator="${operator}"]').click()`);
      assert.equal(await evaluate(`document.querySelector('[data-operator="${operator}"]').getAttribute('aria-pressed')`), "true");
    }
    if (item.prefix === "+226") {
      await evaluate("document.querySelector('[data-operator=orange_bf]').click()");
      assert.equal(await evaluate("document.querySelector('[data-orange-otp]').hidden"), false);
      assert(await evaluate("document.querySelector('[data-orange-otp]').textContent.includes('*144*4*6*3500#')"));
    }
    await screenshot("automatic-" + item.name);
    // Reproduce a reopened tab/browser that has lost its selected recharge.
    await evaluate("sessionStorage.removeItem('shineray-deposit-draft')");
    const selectedUrl = new URL(href);
    await navigate(selectedUrl.pathname + selectedUrl.search);
    await waitFor("document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'");
    assert.equal(await evaluate("document.querySelector('[data-deposit-missing]').hidden"), true, item.name);
    assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('shineray-deposit-draft')).amount_fcfa"), 3500);
    assert.equal(await evaluate("document.querySelector('[data-deposit-prefix]').textContent"), item.prefix);
    assert.equal(await evaluate("document.querySelector('[data-deposit-amount]').textContent.replace(/[\\s,]/g,'')"), "FCFA3500");
  }
  // Invalid URL amounts cannot become a draft.
  await evaluate("sessionStorage.removeItem('shineray-deposit-draft')");
  await navigate("/choisir-operateur?amount=3499&channel=2");
  assert.equal(await evaluate("document.querySelector('[data-deposit-missing]').hidden"), false);
  console.log("PASS: BJ/BF/TG/CI/CM automatic operators and country prefixes, BF Orange OTP/USSD, CI Wave manual when configured, 3500-FCFA selections recovered after lost sessionStorage, 3499 rejected; no payment initiated.");
};

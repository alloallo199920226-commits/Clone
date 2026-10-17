const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot }) => {
  const ready = "document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false' && !document.documentElement.classList.contains('site-navigation-pending')";
  const remaining = () => evaluate(`(() => {
    const [m,s]=document.querySelector('.deposit-timer').textContent.split(':').map(Number);
    return m*60+s;
  })()`);
  const toggle = () => evaluate("document.querySelector('[data-deposit-language]').click()");
  await navigate("/recharger");
  await evaluate("document.querySelector('[data-amount-choice=\"8000\"]').click();document.querySelector('[data-payment-action]').click()");
  await waitFor(`location.pathname==='/choisir-operateur' && ${ready}`);
  const initial = await remaining();
  assert(initial > 1180 && initial <= 1200);
  await waitFor(`document.querySelector('.deposit-timer').textContent !== ${JSON.stringify(await evaluate("document.querySelector('.deposit-timer').textContent"))}`);
  assert(await remaining() < initial, "The timer must actually tick");
  await toggle();
  assert.equal(await evaluate("document.documentElement.lang"), "en");
  assert.equal(await evaluate("document.querySelector('[data-deposit-language]').textContent"), "Français");
  assert.equal(await evaluate("document.querySelector('[data-submit-label]').textContent"), "Submit");
  assert.equal(await evaluate("document.querySelector('#deposit-phone').placeholder"), "Your phone number");
  assert.equal(await evaluate("document.querySelector('.deposit-close').getAttribute('aria-label')"), "Close and return to Top up");
  await evaluate("document.querySelector('#deposit-phone').value='123';document.querySelector('#deposit-operator-form').requestSubmit()");
  assert((await evaluate("document.querySelector('[data-deposit-status]').textContent")).includes("8-digit"));
  await toggle();
  assert((await evaluate("document.querySelector('[data-deposit-status]').textContent")).includes("8 chiffres"));
  await toggle();
  await screenshot("shineray-deposit-english-operator");
  const start = await evaluate("JSON.parse(sessionStorage.getItem('shineray-deposit-draft')).created_at");
  await evaluate("document.querySelector('[data-operator=\"moov\"]').click();document.querySelector('#deposit-phone').value='91234567';document.querySelector('#deposit-operator-form').requestSubmit()");
  await waitFor(`location.pathname==='/confirmation-depot' && ${ready}`);
  assert.equal(await evaluate("document.documentElement.lang"), "en");
  assert.equal(await evaluate("document.querySelector('[data-merchant-name]').textContent"), "To be configured by the administrator");
  assert.equal(await evaluate("document.querySelector('[data-ussd-heading]').textContent"), "How to transfer to MOOV Money via USSD:");
  assert.equal(await evaluate("document.querySelector('[data-deposit-result]').textContent"), "Get the result");
  assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('shineray-deposit-draft')).created_at"), start);
  assert(await remaining() <= initial, "Navigation must not reset the countdown");
  await evaluate("document.querySelector('[data-deposit-result]').click()");
  assert((await evaluate("document.querySelector('[data-deposit-status]').textContent")).includes("No payment"));
  await toggle();
  assert((await evaluate("document.querySelector('[data-deposit-status]').textContent")).includes("Aucun paiement"));
  await toggle();
  await screenshot("shineray-deposit-english-confirmation");

  // Persist elapsed time, then reload: no fresh countdown or lost choices.
  await evaluate("const d=JSON.parse(sessionStorage.getItem('shineray-deposit-draft'));d.created_at-=65000;sessionStorage.setItem('shineray-deposit-draft',JSON.stringify(d))");
  await navigate("/confirmation-depot");
  await waitFor(ready);
  assert(await remaining() <= initial - 65);
  assert.equal(await evaluate("document.documentElement.lang"), "en");
  assert.equal(await evaluate("document.querySelector('[data-deposit-phone]').textContent"), "+228 91234567");
  await evaluate("document.querySelector('[data-deposit-modify]').click()");
  await waitFor(`location.pathname==='/choisir-operateur' && ${ready}`);
  assert(await remaining() <= initial - 65);
  assert.equal(await evaluate("document.querySelector('#deposit-phone').value"), "91234567");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 744, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
  assert(await evaluate(`(() => {
    const button=document.querySelector('.deposit-submit').getBoundingClientRect();
    const label=document.querySelector('[data-submit-label]').getBoundingClientRect();
    const arrow=document.querySelector('.deposit-submit [aria-hidden]').getBoundingClientRect();
    return Math.abs((label.left+label.right-button.left-button.right)/2)<2 && label.right<arrow.left;
  })()`), "The translated submit label stays centered and does not overlap the arrow");
  await screenshot("shineray-deposit-english-small");

  // Timer/language remain operational offline and catch up after suspension.
  await call("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await toggle();
  assert.equal(await evaluate("document.documentElement.lang"), "fr");
  const beforeSleep = await remaining();
  await evaluate("window.originalDateNow=Date.now;Date.now=()=>window.originalDateNow()+10000;document.dispatchEvent(new Event('visibilitychange'))");
  assert(await remaining() <= beforeSleep - 10);
  await toggle();
  await evaluate("Date.now=()=>JSON.parse(sessionStorage.getItem('shineray-deposit-draft')).created_at+1200001;document.dispatchEvent(new Event('visibilitychange'))");
  assert.equal(await evaluate("document.querySelector('.deposit-timer').textContent"), "00:00");
  assert.equal(await evaluate("document.querySelector('[data-deposit-content]').hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-deposit-missing]').hidden"), false);
  assert((await evaluate("document.querySelector('[data-deposit-missing]').textContent")).includes("20-minute session has expired"));
  await evaluate("document.querySelector('#deposit-operator-form').requestSubmit()");
  assert.equal(await evaluate("location.pathname"), "/choisir-operateur");
  await call("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await evaluate("Date.now=window.originalDateNow;const expiredDraft=JSON.parse(sessionStorage.getItem('shineray-deposit-draft'));expiredDraft.created_at=Date.now()-1200001;sessionStorage.setItem('shineray-deposit-draft',JSON.stringify(expiredDraft))");
  for (const path of ["/confirmation-depot", "/choisir-operateur"]) {
    await navigate(path);
    assert.equal(await evaluate("document.querySelector('[data-deposit-missing]').hidden"), false);
    assert((await evaluate("document.querySelector('[data-deposit-missing]').textContent")).includes("expired"));
  }
  await navigate("/recharger");
  await evaluate("document.querySelector('[data-amount-choice=\"4000\"]').click();document.querySelector('[data-payment-action]').click()");
  await waitFor(`location.pathname==='/choisir-operateur' && ${ready}`);
  assert(await remaining() > 1180, "Explicitly starting a new draft creates a new deadline");
  await toggle();
  await screenshot("shineray-deposit-french-timer");
  assert.equal(await evaluate("(async()=> (await (await fetch('/api/activity')).json()).activities.length)()"), 1);
  assert.equal(await evaluate("(async()=> (await (await fetch('/api/me')).json()).balance_fcfa)()"), 2300);
  console.log("PASS: FR/EN static/dynamic text, labels, persisted language; live 20-minute timer, navigation/reload continuity, offline/suspension catch-up, expiry guards, fresh restart, no financial changes.");
};

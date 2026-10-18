const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, owner }) => {
  assert.equal(await evaluate("fetch('/api/me').then(r=>r.json()).then(u=>u.balance_fcfa)"), 2300);
  await navigate("/financement");
  await waitFor("document.body.innerText.includes('Bonus de bienvenue')");
  await screenshot("shineray-welcome-bonus");
  await navigate("/equipe");
  await waitFor("document.querySelector('[data-team-levels]')?.textContent.includes('40%')");
  for (const rate of ["40%", "2%", "1%"]) assert((await evaluate("document.querySelector('[data-team-levels]').textContent")).includes(rate));
  assert((await evaluate("document.body.innerText")).includes("premier dépôt approuvé"));
  await screenshot("shineray-referral-policy");
  await navigate("/recharger");
  assert.equal(await evaluate("document.querySelector('#amount').min"), "500");
  await evaluate("document.querySelector('#amount').value='499';document.querySelector('[data-payment-action]').click()");
  assert((await evaluate("document.querySelector('[data-payment-status]').textContent")).includes("500"));
  await evaluate("document.querySelector('[data-amount-choice=\"500\"]').click();document.querySelector('[data-payment-action]').click()");
  await waitFor("location.pathname==='/choisir-operateur' && document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'");
  assert.equal(await evaluate("document.querySelector('[data-deposit-amount]').textContent"), "FCFA 500");
  await evaluate("document.querySelector('#deposit-phone').value='91234567';document.querySelector('#deposit-operator-form').requestSubmit()");
  await waitFor("location.pathname==='/confirmation-depot' && document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'");
  assert.equal(await evaluate("document.querySelector('[data-deposit-amount]').textContent"), "FCFA 500");
  await navigate("/administration-depots");
  assert((await evaluate("document.body.innerText")).includes("Accès réservé"));
  assert.equal(await evaluate("fetch('/api/admin/deposits',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)"), 401);
  // Explicit privilege only on this temporary test user, removed by the runner.
  assert(Number.isSafeInteger(owner.id));
  execFileSync("python3", ["-c",
    "import sys,auth_backend\nwith auth_backend.connect() as c,c.cursor() as q:q.execute('UPDATE shineray_users SET is_admin=TRUE WHERE id=%s',(int(sys.argv[1]),))",
    String(owner.id)]);
  await navigate("/compte");
  await waitFor("Boolean(document.querySelector('a[href=\"/administration-depots\"]'))");
  await evaluate("document.querySelector('a[href=\"/administration-depots\"]').click()");
  await waitFor("location.pathname==='/administration-depots' && Boolean(document.querySelector('[data-admin-deposit-form]')) && !document.documentElement.classList.contains('site-navigation-pending')");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 744, deviceScaleFactor: 1, mobile: true });
  const reference = `browser-receipt-${owner.id}`;
  await evaluate(`document.querySelector('[name=phone]').value=${JSON.stringify(owner.phone)};
    document.querySelector('[name=amount_fcfa]').value='500';
    document.querySelector('[name=provider_reference]').value=${JSON.stringify(reference)};
    document.querySelector('[name=receipt_verified]').checked=true;
    document.querySelector('[data-admin-deposit-form]').requestSubmit()`);
  await waitFor("document.querySelector('[data-admin-status]').textContent.includes('Dépôt approuvé et crédité')");
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
  await screenshot("shineray-admin-deposit-approved");
  await evaluate("document.querySelector('[data-admin-deposit-form]').requestSubmit()");
  await waitFor("document.querySelector('[data-admin-status]').textContent.includes('déjà approuvé')");
  assert.equal(await evaluate("fetch('/api/me').then(r=>r.json()).then(u=>u.balance_fcfa)"), 2800);
  await navigate("/historique-recharges");
  await waitFor("document.body.innerText.includes('FCFA 500')");
  assert((await evaluate("document.body.innerText")).includes("Succès"));
  await screenshot("shineray-admin-deposit-history");
  console.log("PASS: visible welcome bonus, referral rates/basis, 499 rejected/500 accepted through confirmation, admin-only access, explicit temporary admin, real approval UI, duplicate safety, credited balance and history.");
};

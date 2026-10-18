const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, owner }) => {
  const api = (url, method = "GET", body) => evaluate(`fetch(${JSON.stringify(url)},{
    method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},
    ${body ? `body:JSON.stringify(${JSON.stringify(body)})` : ""}
  }).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal((await api("/api/admin/overview")).status, 403);
  assert(Number.isSafeInteger(owner.id));
  // Only this newly created fixture is promoted; cleanup removes it and its writes.
  execFileSync("python3", ["-c",
    "import sys,auth_backend\nwith auth_backend.connect() as c,c.cursor() as q:q.execute('UPDATE shineray_users SET is_admin=TRUE WHERE id=%s',(int(sys.argv[1]),))",
    String(owner.id)]);
  await navigate("/compte");
  await waitFor("Boolean(document.querySelector('a[href=\"/omarshark-junior-panam\"]'))");
  await navigate("/omarshark-junior-panam");
  await waitFor("document.querySelector('#login-view')?.hidden===false");
  const originalScript = await evaluate("fetch('/admin-ui/general.js').then(r=>r.text())");
  assert.equal(createHash("sha256").update(originalScript).digest("hex"),
    "7ef5a51fb30564fc1ffc06f1a191ca0ed9ec9bc8f18a7449f514614a4868526c");
  await screenshot("shineray-original-admin-login");
  await evaluate("document.querySelector('#admin-password').value='reference-browser-test-password';document.querySelector('#admin-login').requestSubmit()");
  await waitFor("document.querySelector('#dashboard-view')?.hidden===false && document.querySelector('#admin-content').textContent.includes('État de la plateforme')");
  await call("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
  await screenshot("shineray-original-admin-desktop");
  await evaluate("document.querySelector('[data-tab=products]').click()");
  await waitFor("Boolean(document.querySelector('[data-form=product]'))");
  const name = "Browser fixture " + owner.id;
  await evaluate(`(()=>{const f=document.querySelector('[data-form=product]');
    f.elements.name.value=${JSON.stringify(name)};f.elements.price.value='4000';
    f.elements.dailyIncome.value='100';f.elements.totalIncome.value='1000';
    f.elements.durationDays.value='10';f.requestSubmit()})()`);
  await waitFor(`document.querySelector('.admin-list')?.textContent.includes(${JSON.stringify(name)})`);
  const product = (await api("/api/admin/products")).body.products.find(p => p.name === name);
  assert(product);
  await evaluate(`document.querySelector('[data-product-edit="${product.id}"]').click()`);
  await waitFor(`document.querySelector('[data-form=product]')?.elements.name.value===${JSON.stringify(name)}`);
  await evaluate(`(()=>{const f=document.querySelector('[data-form=product]');f.elements.name.value=${JSON.stringify(name + " updated")};f.requestSubmit()})()`);
  await waitFor(`document.querySelector('.admin-list')?.textContent.includes(${JSON.stringify(name + " updated")})`);
  assert.equal((await api("/api/admin/products")).body.products.find(p => p.id === product.id).name, name + " updated");
  await evaluate("document.querySelector('[data-tab=users]').click()");
  await waitFor("Boolean(document.querySelector('[data-admin-user-search]'))");
  await evaluate(`(()=>{const s=document.querySelector('[data-admin-user-search]');s.value=${JSON.stringify(owner.phone)};s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitFor(`Boolean(document.querySelector('[data-user="${owner.id}"]'))`);
  await evaluate(`document.querySelector('[data-user="${owner.id}"]').click()`);
  await waitFor("Boolean(document.querySelector('.admin-user-panel'))");
  // Accept the fixture's confirmation without changing application code.
  await evaluate("window.confirm=()=>true;document.querySelector('[name=credit]').value='100';document.querySelector('[data-balance=credit]').click()");
  await waitFor("document.querySelector('#admin-notice')?.textContent.includes('Solde mis à jour')");
  assert.equal((await api("/api/me")).body.balance_fcfa, 2400);
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot("shineray-original-admin-users-mobile");
  await evaluate("document.querySelector('.admin-user-panel .admin-panel-close')?.click()");
  await evaluate("document.querySelector('[data-tab=settings]').click()");
  await waitFor("document.querySelector('[name=signupBonus]')?.value==='2300'");
  assert.equal(await evaluate("document.querySelector('[name=depositMin]').value"), "500");
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "Settings must fit the mobile viewport");
  assert.equal(await evaluate("document.querySelector('.admin-runtime-nav').getBoundingClientRect().width<=innerWidth"), true);
  await evaluate("document.querySelector('[data-tab=support]').scrollIntoView({block:'nearest',inline:'center'})");
  assert.equal(await evaluate("(()=>{const r=document.querySelector('[data-tab=support]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()"), true, "Last navigation section must be reachable");
  await screenshot("shineray-original-admin-settings-mobile");
  await evaluate("document.querySelector('[data-tab=channels]').click()");
  await waitFor("Boolean(document.querySelector('[data-form=channel]'))");
  await evaluate(`(()=>{const f=document.querySelector('[data-form=channel]');
    f.elements.country.value='Togo';f.elements.country.dispatchEvent(new Event('change'));
    f.elements.operatorName.value='Togocel';f.elements.receiverNumber.value='91234567';
    f.elements.receiverName.value=${JSON.stringify(name)};f.requestSubmit()})()`);
  await waitFor(`document.querySelector('[data-resource=channels]')?.textContent.includes(${JSON.stringify(name)})`);
  await evaluate("document.querySelector('[data-tab=announcements]').click()");
  await waitFor("Boolean(document.querySelector('[data-form=announcement]'))");
  await evaluate(`(()=>{const f=document.querySelector('[data-form=announcement]');
    f.elements.title.value=${JSON.stringify(name)};f.elements.content.value='Contenu de test isolé';f.requestSubmit()})()`);
  await waitFor(`document.querySelector('[data-resource=announcements]')?.textContent.includes(${JSON.stringify(name)})`);
  const receipt = "browser-imported-admin-" + owner.id;
  assert.equal((await api("/api/admin/deposits", "POST",
    {phone: owner.phone, amount_fcfa: 500, provider_reference: receipt, receipt_verified: true})).status, 201);
  await evaluate("document.querySelector('[data-tab=history]').click()");
  await waitFor("Boolean(document.querySelector('[data-history-search]'))");
  await evaluate(`(()=>{const s=document.querySelector('[data-history-search]');s.value=${JSON.stringify(receipt)};s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitFor(`document.querySelector('[data-history-list]')?.textContent.includes(${JSON.stringify(receipt)})`);
  await evaluate("(()=>{const s=document.querySelector('[data-history-search]');s.value='missing-isolated-receipt';s.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await waitFor("!document.querySelector('[data-history-list]')?.textContent.includes('browser-imported-admin-')");
  assert.equal(await evaluate("document.querySelectorAll('[data-history-list] .admin-transaction-card').length"), 0);
  await evaluate(`(()=>{const s=document.querySelector('[data-history-search]');s.value=${JSON.stringify(receipt)};s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitFor(`document.querySelector('[data-history-list]')?.textContent.includes(${JSON.stringify(receipt)})`);
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "History must fit the mobile viewport");
  await screenshot("shineray-original-admin-history-mobile");
  assert.equal((await api("/api/me")).body.balance_fcfa, 2900);
  await evaluate("document.querySelector('#logout').click()");
  await waitFor("document.querySelector('#login-view').hidden===false");
  assert.equal((await api("/api/admin/overview")).status, 401);
  console.log("PASS: byte-identical imported JS; original login/desktop/mobile; role enforcement; product create/edit; user search and confirmed real credit; saved channel and draft; real settled receipt history; original policy; independent console logout.");
};

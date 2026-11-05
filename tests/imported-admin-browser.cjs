const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, owner }) => {
  const api = (url, method = "GET", body) => evaluate(`fetch(${JSON.stringify(url)},{
    method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},
    ${body ? `body:JSON.stringify(${JSON.stringify(body)})` : ""}
  }).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal((await api("/api/admin/overview")).status, 401);
  assert(Number.isSafeInteger(owner.id));
  // No customer fixture is promoted; only the console password authorizes.
  await navigate("/omarshark-junior-panam");
  await waitFor("document.querySelector('#login-view')?.hidden===false");
  const originalScript = await evaluate("fetch('/admin-ui/general.js').then(r=>r.text())");
  assert.equal(createHash("sha256").update(originalScript).digest("hex"),
    "7ef5a51fb30564fc1ffc06f1a191ca0ed9ec9bc8f18a7449f514614a4868526c");
  await screenshot("shineray-original-admin-login");
  await evaluate("document.querySelector('#admin-password').value='reference-browser-test-password';document.querySelector('#admin-login').requestSubmit()");
  await waitFor("document.querySelector('#login-error')?.textContent.includes('incorrect')");
  assert.equal((await api("/api/admin/overview")).status, 401);
  await evaluate("document.querySelector('#admin-password').value='isolated-browser-console-password';document.querySelector('#admin-login').requestSubmit()");
  await waitFor("document.querySelector('#dashboard-view')?.hidden===false && document.querySelector('#admin-content').textContent.includes('État de la plateforme')");
  const previousMode = (await api("/api/admin/withdraw-override")).body.mode;
  try {
    await evaluate("window.confirm=()=>true");
    for (const mode of ["open", "closed", "scheduled"]) {
      await evaluate(`document.querySelector('[data-withdraw-mode="${mode}"]').click()`);
      await waitFor(`document.querySelector('[data-withdraw-mode="${mode}"]')?.disabled===true`);
      const state = (await api("/api/admin/overview")).body;
      assert.equal(state.withdrawOpenOverride, mode === "open");
      assert.equal(state.withdrawClosedOverride, mode === "closed");
      assert(!await evaluate("document.querySelector('#admin-notice').textContent.includes('pas activés')"));
    }
    await waitFor("document.querySelector('#admin-content').textContent.includes('09 h à 18 h, heure du Maroc')");
    assert.equal(await evaluate("document.documentElement.dataset.platformTheme"),"narke");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.admin-header')).color"),"rgb(245, 251, 255)");
    assert(!await evaluate("getComputedStyle(document.querySelector('.admin-stat-card')).backgroundImage.includes('silver')"),
      "The signed-in console must no longer inherit the archived silver imagery");
    await navigate("/omarshark-junior-panam");
    await waitFor("document.querySelector('[data-withdraw-mode=scheduled]')?.disabled===true");
    await screenshot("iveco-admin-withdrawal-controls");
  } finally {
    assert.equal((await api("/api/admin/withdraw-override", "PATCH", {mode: previousMode})).status, 200);
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
  await screenshot("shineray-original-admin-desktop");
  await evaluate("document.querySelector('[data-tab=products]').click()");
  await waitFor("Boolean(document.querySelector('[data-form=product]'))");
  const storefrontProducts = (await api("/api/admin/products")).body.products;
  for (const code of ["VIP1","VIP2","VIP3","VIP4","VIP5","VIP6"]) {
    assert(storefrontProducts.some(p=>p.code===code), `${code} must be editable in admin`);
  }
  const vip1 = storefrontProducts.find(p=>p.code==="VIP1");
  const oldTerms = Object.fromEntries(["name","price","dailyIncome","totalIncome","durationDays"].map(k=>[k,vip1[k]]));
  try {
    await evaluate(`document.querySelector('[data-product-edit="${vip1.id}"]').click()`);
    await waitFor(`document.querySelector('[data-form=product]').elements.name.value===${JSON.stringify(vip1.name)}`);
    await evaluate(`(()=>{const f=document.querySelector('[data-form=product]');
      f.elements.name.value='VIP1 test catalogue';f.elements.price.value='4100';
      f.elements.dailyIncome.value='1100';f.elements.totalIncome.value='198000';
      f.elements.durationDays.value='180';f.requestSubmit()})()`);
    await waitFor("document.querySelector('.admin-list').textContent.includes('VIP1 test catalogue')");
    await navigate("/accueil");
    await waitFor("document.querySelector('[data-vip=VIP1]').dataset.price==='4100'");
    assert.equal(await evaluate("document.querySelector('[data-vip=VIP1]').dataset.name"), "VIP1 test catalogue");
    assert.equal(await evaluate("document.querySelector('[data-vip=VIP1]').dataset.daily"), "1100");
    assert.equal(await evaluate("document.querySelector('[data-vip=VIP1]').dataset.total"), "198000");
    await evaluate("document.querySelector('[data-notification-close]').click()");
    await screenshot("iveco-admin-catalog-home-updated");
  } finally {
    assert.equal((await api(`/api/admin/products/${vip1.id}`, "PATCH", oldTerms)).status, 200);
  }
  await navigate("/omarshark-junior-panam");
  await waitFor("document.querySelector('[data-tab=products]')");
  await evaluate("document.querySelector('[data-tab=products]').click()");
  await waitFor("document.querySelectorAll('[data-product-edit]').length>=6");
  await screenshot("iveco-admin-existing-vip-products");
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
  assert.equal(await evaluate("document.querySelector('[name=depositMin]').value"), "3500");
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
    {phone: owner.phone, amount_fcfa: 3500, provider_reference: receipt, receipt_verified: true})).status, 201);
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
  assert.equal((await api("/api/me")).body.balance_fcfa, 5900);
  await evaluate("document.querySelector('#logout').click()");
  await waitFor("document.querySelector('#login-view').hidden===false");
  assert.equal((await api("/api/admin/overview")).status, 401);
  console.log("PASS: byte-identical imported JS; persistent withdrawal open/closed/scheduled controls and Morocco hours; original login/desktop/mobile; dedicated password without promotion; product create/edit; user search and confirmed real credit; saved channel and draft; real settled receipt history; current policy; independent console logout.");
};

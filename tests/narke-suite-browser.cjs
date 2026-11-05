/* Development-only browser regression. All data belongs to the temporary
   account created and removed by browser-reference-check.cjs. No provider call. */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomInt } = require("node:crypto");
const fs = require("node:fs");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, base, owner, payload, trackUser }) => {
  // Populate only this throwaway user's settled history; never approve a real deposit.
  execFileSync("python3", ["-c", `
import auth_backend
from psycopg.types.json import Jsonb
uid=${Number(owner.id)}
with auth_backend.connect() as conn, conn.cursor() as cur:
 for i in range(3):
  cur.execute("""INSERT INTO shineray_transactions
   (user_id,kind,label,amount_fcfa,provider_reference,details)
   VALUES (%s,'recharge','Dépôt de test NARKE',3500,%s,%s)""",
   (uid,f'narke-suite-browser-{uid}-{i}',Jsonb({'channel':'MTN'})))
`], { encoding: "utf8" });
  const me = await evaluate("fetch('/api/me').then(r=>r.json())");
  const child = await evaluate(`fetch('/api/auth/register',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(${JSON.stringify({
      country_code: "+228", phone: "9" + randomInt(1000000, 9999999),
      password: payload.password, referral_code: me.referral_code,
    })})}).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(child.status, 201);
  trackUser(child.body.user.id);
  const login = await evaluate(`fetch('/api/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(${JSON.stringify(payload)})}).then(r=>r.status)`);
  assert.equal(login, 200);
  const get = path => evaluate(`fetch(${JSON.stringify(path)}).then(r=>r.json())`);
  const routes = [
    ["/retrait", "withdraw", "document.querySelector('[data-account-balance]').dataset.available"],
    ["/service-client", "support", "document.querySelector('.reference-contact')"],
    ["/historique-recharges", "deposits", "document.querySelector('[data-activity-list]').getAttribute('aria-busy')==='false'"],
    ["/compte", "account", "/[0-9]/.test(document.querySelector('[data-demo-balance]').textContent)"],
    ["/missions", "missions", "document.querySelector('[data-mission-list]').getAttribute('aria-busy')==='false'"],
    ["/missions-vip", "missions-vip", "document.querySelector('[data-mission-list]').getAttribute('aria-busy')==='false'"],
    ["/equipe", "team", "document.querySelector('[data-team-page]').getAttribute('aria-busy')==='false'"],
    ["/mon-equipe", "team-detail", "document.querySelector('[data-team-page]').getAttribute('aria-busy')==='false'"],
  ];
  const readyByRoute = Object.fromEntries(routes.map(([route, , ready]) => [route, ready]));
  async function open(route) {
    await navigate(route);
    await waitFor(readyByRoute[route]);
    await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
  }
  for (const width of [320, 390, 472, 768, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height: 920, deviceScaleFactor: 1, mobile: width < 600,
    });
    for (const [route, name] of routes) {
      await open(route);
      assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `${name} overflows at ${width}`);
      if (name === "team") {
        assert(await evaluate(`[...document.querySelectorAll('.team-level-name')].every(label=>{
          const text=label.getBoundingClientRect(),cell=label.closest('td').getBoundingClientRect();
          return text.width>=40 && text.height<=cell.height-4;
        })`), `Team level labels collide at ${width}`);
      }
      assert(await evaluate("!document.querySelector('script[src*=\"narke-suite\"]') || !!document.querySelector('link[href*=\"narke-suite.css\"]')"));
      if (width === 472 || width === 1280) {
        await screenshot(`narke-suite-${name}-${width}`);
      }
      if (width === 472) {
        const metrics = await call("Page.getLayoutMetrics");
        const pageHeight = Math.min(5000, Math.ceil(metrics.cssContentSize.height));
        const image = await call("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: true,
          clip: { x: 0, y: 0, width, height: pageHeight, scale: 1 },
        });
        fs.writeFileSync(`/tmp/narke-suite-${name}-full.png`, Buffer.from(image.data, "base64"));
      }
    }
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 472, height: 920, deviceScaleFactor: 1, mobile: true });
  await open("/compte");
  assert.equal(Number((await evaluate("document.querySelector('[data-demo-balance]').textContent")).replace(/\D/g, "")), me.balance_fcfa);
  await evaluate("document.querySelector('.gift-code-toggle').click()");
  assert(await evaluate("!document.querySelector('#gift-code-panel').hidden"));
  assert.equal(await evaluate("document.querySelector('.gift-code-toggle').getAttribute('aria-expanded')"), "true");
  await screenshot("narke-suite-gift-open");
  await evaluate("document.querySelector('.gift-code-toggle').click()");
  assert(await evaluate("document.querySelector('#gift-code-panel').hidden"));
  await evaluate("document.querySelector('[data-suite-menu-button]').click()");
  assert(await evaluate("!document.querySelector('#narke-suite-menu').hidden"));
  assert.equal(await evaluate("document.querySelector('[data-suite-menu-button]').getAttribute('aria-expanded')"), "true");
  await screenshot("narke-suite-menu-open");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  assert(await evaluate("document.querySelector('#narke-suite-menu').hidden"));
  assert.equal(await evaluate("document.querySelector('[data-suite-menu-button]').getAttribute('aria-expanded')"), "false");
  assert.equal(await evaluate("document.querySelector('[data-suite-bell]').getAttribute('href')"), "/notifications");
  assert.equal(await evaluate("fetch(document.querySelector('[data-suite-bell]').href).then(r=>r.status)"), 200);
  for (const route of ["/financement", "/historique-recharges", "/historique-retraits", "/gestion-compte-bancaire", "/a-propos", "/regles", "/service-client"]) {
    assert(await evaluate(`!!document.querySelector('a[href="${route}"]')`), `Account route missing: ${route}`);
  }
  await open("/retrait");
  assert.equal(Number(await evaluate("document.querySelector('[data-account-balance]').dataset.available")), me.balance_fcfa);
  for (const [amount, net] of [[2300, 1840], [5000, 4000], [5001, 4001]]) {
    await evaluate(`(()=>{const amount=document.querySelector('#amount');amount.value='${amount}';amount.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert.equal(Number((await evaluate("document.querySelector('[data-amount-received]').textContent")).replace(/\D/g, "")), net);
  }
  await evaluate("document.querySelector('[data-wallet-select]').click()");
  assert(await evaluate("!document.querySelector('[data-wallet-options]').hidden"));
  // Verify a blocked request cannot change the balance, even when there is no wallet/VIP.
  await evaluate("document.querySelector('#amount').value='1';document.querySelector('[data-payment-action]').click()");
  await waitFor("document.querySelector('[data-payment-status]').textContent.trim().length>0");
  assert.equal((await get("/api/me")).balance_fcfa, me.balance_fcfa);
  await open("/service-client");
  const destinations = await evaluate("[...document.querySelectorAll('[data-contact]')].map(a=>a.href)");
  assert.deepEqual(destinations, ["https://t.me/Ivecoservice", "https://whatsapp.com/channel/0029Vb908sVDZ4LVfxtZJA1r", "https://t.me/+jYx8aX3eSwozNmQ0"]);
  assert(await evaluate("[...document.querySelectorAll('[data-contact]')].every(a=>a.rel.includes('noopener'))"));
  await open("/historique-recharges");
  const activities = (await get("/api/activity?kind=recharge")).activities;
  assert.equal(activities.length, 3);
  assert.equal(await evaluate("document.querySelectorAll('[data-activity-list] article').length"), activities.length);
  assert(await evaluate("[...document.querySelectorAll('[data-activity-list] article')].every(c=>c.textContent.includes('MTN'))"));
  assert(!await evaluate("document.querySelector('[data-activity-list]').textContent.includes('narke-suite-browser-')"));
  await open("/missions");
  const missionData = await get("/api/missions");
  const cards = await evaluate("document.querySelectorAll('.mission-card').length");
  assert.equal(cards, missionData.missions.filter(m=>/inv|referr|parrain/i.test(m.type)).length);
  assert.equal(await evaluate("document.querySelectorAll('.mission-action:not(:disabled)').length"), 0);
  assert(await evaluate("!!document.querySelector('a[href=\"/missions-vip\"]')"));
  await open("/missions-vip");
  assert(await evaluate("document.querySelectorAll('.mission-card').length>0"));
  assert(await evaluate("!!document.querySelector('a[href=\"/missions\"]')"));
  assert.equal((await get("/api/me")).balance_fcfa, me.balance_fcfa);
  await open("/equipe");
  const team = await get("/api/team");
  assert.equal(team.levels[0], 1);
  assert.equal(await evaluate("document.querySelector('[data-referral-code]').textContent"), me.referral_code);
  assert(await evaluate("document.querySelector('[data-referral-link]').textContent.includes('/inscription?c=')"));
  await call("Browser.grantPermissions", { origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await call("Page.bringToFront");
  for (const kind of ["code", "link"]) {
    const position = await evaluate(`(()=>{const b=document.querySelector('[data-copy-value="${kind}"]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call("Input.dispatchMouseEvent", { type: "mousePressed", ...position, button: "left", clickCount: 1 });
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...position, button: "left", clickCount: 1 });
    await waitFor(`document.querySelector('[data-copy-value="${kind}"]').dataset.copied==='true'`);
    assert.equal(await evaluate("navigator.clipboard.readText()"), await evaluate(`document.querySelector('[data-referral-${kind}]').textContent`));
  }
  await open("/mon-equipe");
  assert.equal(await evaluate("document.querySelectorAll('.team-member-row').length"), 1);
  assert(await evaluate("document.querySelector('.team-member-phone').textContent.includes('*')"));
  await screenshot("narke-suite-team-detail-populated");
  for (const level of [2, 3, 1]) {
    await evaluate(`document.querySelector('[data-team-level-tab="${level}"]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-team-level-tab="${level}"]').getAttribute('aria-selected')`), "true");
    assert.equal(await evaluate("document.querySelectorAll('.team-member-row').length"), level === 1 ? 1 : 0);
  }
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  assert(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"));
  await require("./missions-browser.cjs")({
    userId: owner.id, call, evaluate, navigate, waitFor, screenshot,
  });
  await open("/compte");
  const logoutPosition = await evaluate(`(()=>{
    const button=document.querySelector('[data-logout]');
    button.scrollIntoView({block:'center'});
    const r=button.getBoundingClientRect(),nav=document.querySelector('.bottom-navigation').getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,visible:r.bottom<=nav.top};
  })()`);
  assert(logoutPosition.visible, "Logout must be reachable above the fixed navigation");
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: logoutPosition.x, y: logoutPosition.y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: logoutPosition.x, y: logoutPosition.y, button: "left", clickCount: 1 });
  await waitFor("location.pathname==='/connexion'");
  assert.equal(await evaluate("fetch('/api/me').then(r=>r.status)"), 401);
  console.log("PASS: NARKE eight real routes across five widths, live balance/history/referral/mission data, masked member tabs, real clipboard, gift accordion, exact withdrawal rounding, safe blocked withdrawal, configured support URLs and logout.");
};

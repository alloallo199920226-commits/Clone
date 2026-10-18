const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { randomInt } = require("node:crypto");

module.exports = async function checkFilledRecords({
  call, evaluate, waitFor, navigate, screenshot, paused, base,
  owner, loginPayload, trackChild,
}) {
  const descendants = [];
  const ownerCode = await evaluate("fetch('/api/me').then(r=>r.json()).then(user=>user.referral_code)");
  async function invite(referral) {
    const response = await evaluate(`fetch('/api/auth/register',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({country_code:'+228',phone:${JSON.stringify("9" + randomInt(1000000, 9999999))},
        password:'filled-records-browser-password',referral_code:${JSON.stringify(referral)}})
    }).then(async r=>({status:r.status,body:await r.json()}))`);
    assert.equal(response.status, 201);
    const child = response.body.user;
    trackChild(child.id);
    child.referral_code = await evaluate("fetch('/api/me').then(r=>r.json()).then(user=>user.referral_code)");
    descendants.push(child);
    return child;
  }
  const first = await invite(ownerCode);
  await invite(ownerCode);
  await invite(ownerCode);
  const second = await invite(first.referral_code);
  await invite(second.referral_code);
  const ids = [owner.id, ...descendants.map(member => member.id)];
  // Isolated development fixtures only; the caller removes every entry/account.
  execFileSync("python3", ["-c", `
import sys,json,secrets,auth_backend
ids=json.loads(sys.argv[1])
entries=[
 (ids[0],'recharge','Reçu vérifié',8000,{'channel':'Recharger le canal 1'}),
 (ids[0],'recharge','Autre reçu vérifié',4000,{}),
 (ids[0],'withdrawal','Retrait vérifié',-4080,{'net_amount_fcfa':3180}),
 (ids[0],'withdrawal','Ancien retrait vérifié',-2200,{}),
 (ids[0],'purchase','VIP2',-8000,{'vip':2,'quantity':1,'daily_income_fcfa':2000,
   'total_income_fcfa':360000,'validity_days':180,'income_fcfa':6000}),
 (ids[1],'purchase','VIP3',-15000,{'vip':3}),
 (ids[2],'purchase','VIP1',-4000,{'vip':1}),
 (ids[4],'purchase','VIP2',-8000,{'vip':2}),
 (ids[5],'purchase','VIP1',-4000,{'vip':1}),
 (ids[0],'commission','Commission niveau 1',5550,{'source_user_id':ids[1]}),
 (ids[0],'commission','Commission niveau 2',240,{'source_user_id':ids[4]}),
 (ids[0],'commission','Commission niveau 3',40,{'source_user_id':ids[5]})]
with auth_backend.connect() as conn,conn.cursor() as cur:
 for uid,kind,label,amount,details in entries:
  cur.execute("""INSERT INTO shineray_transactions
   (user_id,kind,label,amount_fcfa,provider_reference,details)
   VALUES (%s,%s,%s,%s,%s,%s::jsonb)""",
   (uid,kind,label,amount,'browser-receipt-'+secrets.token_hex(12),json.dumps(details)))
`, JSON.stringify(ids)], { stdio: "inherit" });
  assert.equal(await evaluate(`fetch('/api/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(${JSON.stringify(loginPayload)})}).then(r=>r.status)`), 200);
  async function ready(selector) {
    await waitFor(`document.querySelector(${JSON.stringify(selector)}).getAttribute('aria-busy')==='false'`);
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
  }
  await navigate("/historique-recharges");
  await ready("[data-activity-list]");
  assert.equal(await evaluate("document.querySelectorAll('.reference-activity-card').length"), 2);
  const recharge = await evaluate("document.querySelector('[data-activity-list]').innerText");
  assert(recharge.includes("Ordre de dépôt") && recharge.includes("FCFA 8,000"));
  assert(recharge.includes("Recharger le canal 1") && recharge.includes("Non renseigné"));
  assert(recharge.includes("Succès") && !recharge.includes("browser-receipt-"));
  assert(await evaluate(`[...document.querySelectorAll('.reference-short')]
    .every(node => /^browser-…[a-f0-9]{4}$/.test(node.textContent))`));
  assert.equal(await evaluate("document.querySelectorAll('.reference-copy-button').length"), 2);
  assert(await evaluate("document.body.innerText.includes('Plus aucune donnée')"));
  await screenshot("shineray-populated-deposits");
  await navigate("/historique-retraits");
  await ready("[data-activity-list]");
  const withdrawals = await evaluate("document.querySelector('[data-activity-list]').innerText");
  assert(withdrawals.includes("Ordre de retrait") && withdrawals.includes("FCFA 3,180"));
  assert(withdrawals.includes("—") && !withdrawals.includes("FCFA 3,182"));
  await screenshot("shineray-populated-withdrawals");
  await navigate("/projet");
  await ready("[data-products-list]");
  await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
  assert.equal(await evaluate("document.querySelector('[data-purchase-count]').textContent"), "1");
  assert.equal(await evaluate("document.querySelector('[data-purchase-total]').textContent"), "FCFA 6,000");
  assert(await evaluate("document.querySelector('.owned-product').innerText.includes('VIP2')"));
  assert(await evaluate("document.querySelector('.owned-product').innerText.includes('180 jours')"));
  assert.equal(await evaluate("document.querySelector('[data-products-empty]').hidden"), true);
  await screenshot("shineray-owned-vip");
  await navigate("/mon-equipe");
  await ready("[data-team-page]");
  await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
  assert.equal(await evaluate("document.querySelector('[data-team-level-count=\"1\"]').textContent"), "3");
  assert.equal(await evaluate("document.querySelector('[data-team-level-tab=\"1\"] [data-team-level-revenue]').textContent"), "5,550.00");
  assert.equal(await evaluate("document.querySelectorAll('.team-member-row').length"), 3);
  const members = await evaluate("document.querySelector('[data-team-members]').innerText");
  assert(members.includes("15,000") && members.includes("4,000") && members.includes("****"));
  assert(await evaluate("document.querySelector('.team-member-date').textContent.includes(':')"));
  assert.equal(await evaluate("document.querySelector('[data-team-detail-empty]').hidden"), true);
  await screenshot("shineray-populated-team");
  for (const [level, expectedRevenue] of [[2, "240.00"], [3, "40.00"]]) {
    await evaluate(`document.querySelector('[data-team-level-tab="${level}"]').click()`);
    assert.equal(await evaluate("document.querySelectorAll('.team-member-row').length"), 1);
    assert.equal(await evaluate(`document.querySelector('[data-team-level-tab="${level}"] [data-team-level-revenue]').textContent`), expectedRevenue);
  }
  await call("Page.navigate", { url: base + "/mon-equipe?level=2" });
  await waitFor("location.search==='?level=2' && document.querySelector('[data-team-page]')?.getAttribute('aria-busy')==='false'");
  assert.equal(await evaluate("document.querySelectorAll('[aria-selected=\"true\"]').length"), 1);
  assert.equal(await evaluate("document.querySelector('[data-team-level-tab=\"2\"]').getAttribute('aria-selected')"), "true");
  // Pending is a renderer fixture, not a new financial request or credit.
  await call("Fetch.enable", { patterns: [{ urlPattern: base + "/api/activity?*", requestStage: "Request" }] });
  paused.clear();
  await navigate("/historique-recharges");
  for (let attempt = 0; attempt < 100 && !paused.has("/api/activity"); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert(paused.has("/api/activity"));
  await call("Fetch.fulfillRequest", {
    requestId: paused.get("/api/activity"), responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify({ activities: [{
      id: 1, amount_fcfa: 4000, reference: "RENDERER-ONLY",
      status: "pending", channel: "Recharger le canal 1", created_at: new Date().toISOString(),
    }], has_more: false })).toString("base64"),
  });
  await ready("[data-activity-list]");
  assert(await evaluate("document.querySelector('[data-status=\"pending\"]').textContent.includes('Recharge en cours')"));
  await screenshot("shineray-pending-deposit-renderer");
  await call("Fetch.disable");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 744, deviceScaleFactor: 1, mobile: true });
  for (const route of ["/historique-recharges", "/historique-retraits", "/projet", "/mon-equipe"]) {
    await navigate(route);
    await waitFor("!document.querySelector('[aria-busy=\"true\"]')");
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
  }
  console.log("PASS: populated deposit/withdrawal cards and true receipt amounts, owned VIP income not purchase cost, real masked team/investments/commissions across all levels, initial tab selection, pending renderer, 472/390px layouts.");
};

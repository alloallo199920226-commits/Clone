const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

module.exports = async ({ evaluate, waitFor, navigate, screenshot, owner }) => {
  const balance = () => evaluate("fetch('/api/me').then(r=>r.json()).then(u=>u.balance_fcfa)");
  await navigate("/accueil");
  await waitFor("!document.querySelector('[data-purpose=buy-btn]').disabled");
  await evaluate("document.querySelector('[data-purpose=buy-btn]').click()");
  await waitFor("document.querySelector('dialog[open]')");
  await evaluate("document.querySelector('.confirm-purchase').click()");
  await waitFor("document.querySelector('.purchase-error').textContent.includes('Solde insuffisant')");
  assert.equal(await balance(), 2300);
  await screenshot("vip-insufficient");
  execFileSync("python3", ["-c", `
import sys,uuid,auth_backend
with auth_backend.connect() as conn,conn.cursor() as cur:
 cur.execute("""INSERT INTO shineray_transactions(user_id,kind,label,amount_fcfa,provider_reference)
 VALUES (%s,'bonus','Browser test fixture',4000,%s)""",(int(sys.argv[1]),"vip-browser:"+str(uuid.uuid4())))
`, String(owner.id)]);
  // Debit succeeded, browser response lost: repeat the exact same request once.
  await evaluate(`window.vipFetch=window.fetch;window.vipPosts=0;
    window.fetch=async (url,options)=>{
      const response=await window.vipFetch(url,options);
      if(String(url)==='/api/products/purchase'){
        window.vipPosts++;
        if(window.vipPosts===1)throw new TypeError('Load failed');
      }
      return response;
    };document.querySelector('.confirm-purchase').click()`);
  await waitFor("document.querySelector('.purchase-error').textContent.includes('Réponse interrompue')");
  assert.equal(await balance(), 2300);
  assert(await evaluate("Boolean(JSON.parse(sessionStorage.getItem('shineray-vip-purchase-request')).requestId)"));
  await screenshot("vip-response-lost");
  // Reload preserves the idempotency key and still cannot charge twice.
  await navigate("/accueil");
  await waitFor("!document.querySelector('[data-purpose=buy-btn]').disabled");
  await evaluate("document.querySelector('[data-purpose=buy-btn]').click()");
  await waitFor("document.querySelector('dialog[open]')");
  await evaluate("document.querySelector('.confirm-purchase').click()");
  await waitFor("location.pathname==='/projet'");
  await waitFor("document.querySelector('[data-purchase-count]')?.textContent==='1'");
  assert.equal(await balance(), 2300);
  assert.equal(await evaluate("sessionStorage.getItem('shineray-vip-purchase-request')"), null);
  assert(await evaluate("document.querySelector('[data-products-list]').textContent.includes('VIP1')"));
  assert.equal(await evaluate("fetch('/api/activity?kind=purchase').then(r=>r.json()).then(r=>r.activities.length)"), 1);
  assert.equal(await evaluate("fetch('/api/products').then(r=>r.json()).then(r=>r.income_fcfa)"), 0);
  assert(await evaluate("document.querySelector('[data-products-list]').textContent.includes('Prochain versement')"));
  assert(await evaluate("fetch('/api/products').then(r=>r.json()).then(r=>r.products[0].automatic_income_enabled && r.products[0].next_income_at !== null)"));
  assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await screenshot("vip-purchased");
  // Only this disposable development account is moved to a matured cycle.
  // No real clock, policy activation, production record, or payment provider changes.
  execFileSync("python3", ["-c", `
import sys,auth_backend,product_income
uid=int(sys.argv[1])
with auth_backend.connect() as conn,conn.cursor() as cur:
 cur.execute("""UPDATE shineray_product_income SET
 starts_at=now()-interval '24 hours',next_due_at=now()-interval '1 second'
 WHERE user_id=%s""",(uid,))
product_income.settle_user(uid)
product_income.settle_user(uid)
`, String(owner.id)], { cwd:process.cwd() });
  await navigate("/projet");
  await waitFor("document.querySelector('[data-purchase-total]')?.textContent.includes('1,000')");
  assert.equal(await balance(), 3300);
  assert(await evaluate("document.querySelector('[data-products-list]').textContent.includes('Revenus déjà versés : FCFA 1,000')"));
  const settled = await evaluate("fetch('/api/activity').then(r=>r.json()).then(r=>r.activities.filter(a=>a.kind==='income'))");
  assert.equal(settled.length, 1);
  assert.equal(settled[0].amount_fcfa, 1000);
  await screenshot("vip-income-credited");
  await navigate("/financement");
  await waitFor("document.body.textContent.includes('Revenu quotidien du produit')");
  assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await screenshot("vip-income-ledger");
  console.log("PASS: purchase/retry exactly once, no premature income, scheduled 24h cycle, one matured credit, actual balance +1000, receipt and financial history.");
};

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
  assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  await screenshot("vip-purchased");
  console.log("PASS: insufficient balance, real ledger debit, interrupted response, safe retry after reload, one owned VIP and one history entry, no automatic income.");
};

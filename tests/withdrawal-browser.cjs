const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

module.exports = async ({ userId, evaluate, navigate, waitFor, screenshot }) => {
  const db = code => execFileSync("python3", ["-c",
    `import auth_backend as db\nuid=${Number(userId)}\n${code}`], { encoding: "utf8" });
  try {
    await navigate("/retrait");
    await waitFor("document.querySelector('[data-account-balance]').dataset.available");
    await evaluate(`fetch('/api/wallets',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({provider:'TOGOCEL',phone:'90000000',holder_name:'Fixture'})}).then(r=>r.json())`);
    await navigate("/retrait");
    await waitFor("document.querySelector('[data-wallet-options] button')");
    assert.equal(await evaluate("document.querySelector('#amount').min"), "1500");
    assert(await evaluate("document.body.innerText.includes('heure du Maroc') && document.body.innerText.includes('20 %')"));
    await evaluate(`document.querySelector('[data-wallet-options] button').click();
      document.querySelector('#amount').value='1500';
      document.querySelector('#amount').dispatchEvent(new Event('input'));
      document.querySelector('[data-payment-action]').click()`);
    await waitFor("document.querySelector('[data-payment-status]').textContent.includes('VIP actif')");
    db(`with db.connect() as c,c.cursor() as cur:\n cur.execute("""INSERT INTO shineray_transactions
      (user_id,kind,label,amount_fcfa,provider_reference,details)
      VALUES (%s,'purchase','VIP1',-1,%s,'{"vip":1,"validity_days":180}')""",(uid,'browser-withdrawal-vip:'+str(uid)))
 cur.execute("""INSERT INTO shineray_transactions (user_id,kind,label,amount_fcfa,provider_reference)
      VALUES (%s,'bonus','Fixture',1000,%s)""",(uid,'browser-withdrawal-funds:'+str(uid)))`);
    await navigate("/retrait");
    await waitFor("document.querySelector('[data-wallet-options] button') && document.querySelector('[data-account-balance]').dataset.available");
    await evaluate(`document.querySelector('[data-wallet-options] button').click();
      document.querySelector('#amount').value='1500';
      document.querySelector('#amount').dispatchEvent(new Event('input'));
      document.querySelector('[data-payment-action]').click();
      document.querySelector('[data-payment-action]').click()`);
    await waitFor("document.querySelector('[data-payment-action]').textContent === 'Demande enregistrée'");
    assert.equal(await evaluate("document.querySelector('[data-payment-status]').textContent"), "");
    assert.equal(await evaluate("document.querySelector('[data-payment-status] a')"), null);
    assert(await evaluate("document.querySelector('[data-amount-received]').textContent.replace(/\\s/g,'').includes('1200')"));
    assert.equal(await evaluate("document.querySelector('[data-payment-action]').disabled"), true);
    assert.equal(Number(db(`with db.connect() as c,c.cursor() as cur:
 cur.execute("SELECT count(*) n FROM shineray_withdrawal_requests WHERE user_id=%s",(uid,))
 print(cur.fetchone()['n'])`).trim()), 1);
    assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
    await screenshot("withdrawal-request-recorded");
    await navigate("/historique-retraits");
    await waitFor("document.querySelector('[data-activity-list]').textContent.replace(/[\\s,.]/g,'').includes('1500')");
    assert(await evaluate("document.querySelector('[data-activity-list]').textContent.toLowerCase().includes('en cours')"));
    await screenshot("withdrawal-pending-history");
    console.log("PASS: active VIP gate, minimum 1500, 20% fee/net 1200, displayed Morocco hours, actual request saved once, reserve, mobile history (isolated server in open hours).");
  } finally {
    db(`with db.connect() as c,c.cursor() as cur:
 cur.execute("DELETE FROM shineray_withdrawal_requests WHERE user_id=%s",(uid,))
 cur.execute("DELETE FROM shineray_wallets WHERE user_id=%s",(uid,))`);
  }
};

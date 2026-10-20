const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

module.exports = async ({ evaluate, navigate, waitFor, screenshot }) => {
  const gifts = JSON.parse(execFileSync("python3", ["-c", `
import json,admin_api,auth_backend as db
rows=[]
with db.connect() as conn,conn.cursor() as cur:
 for active in (True,False):
  value=admin_api.validated_resource('gift_code',{'code':'','amount':500,'maxRedemptions':1,'expiresInDays':30})
  value['active']=active
  from psycopg.types.json import Jsonb
  cur.execute("INSERT INTO shineray_admin_resources(kind,value) VALUES ('gift_code',%s) RETURNING id",(Jsonb(value),))
  rows.append({'id':cur.fetchone()['id'],'code':value['code']})
print(json.dumps(rows))
`], { encoding: "utf8" }));
  const balance = () => evaluate("fetch('/api/me').then(r=>r.json()).then(u=>u.balance_fcfa)");
  const submit = async code => evaluate(`(() => {
    document.querySelector('#gift-code-input').value=${JSON.stringify(code)};
    document.querySelector('#gift-code-panel').requestSubmit();
  })()`);
  try {
    await navigate("/compte");
    await waitFor("document.querySelector('[data-user-phone]').textContent.includes('228')");
    assert.equal(await balance(), 2300);
    assert(await evaluate("document.querySelector('#gift-code-panel').hidden"));
    await evaluate("document.querySelector('.gift-code-toggle').click()");
    assert.equal(await evaluate("document.querySelector('.gift-code-toggle').getAttribute('aria-expanded')"), "true");
    await submit("Z".repeat(32));
    await waitFor("document.querySelector('.gift-code-status').textContent.includes('invalide')");
    await submit(gifts[1].code);
    await waitFor("document.querySelector('.gift-code-status').textContent.includes('désactivé')");
    await submit(gifts[0].code.toLowerCase());
    await waitFor("document.querySelector('.gift-code-status').textContent.includes('500 FCFA ajouté')");
    assert.equal(await balance(), 2800);
    assert.equal(await evaluate("document.querySelector('[data-demo-balance]').textContent.replace(/\\s/g,'')"), "2800");
    await evaluate("document.querySelector('.gift-code-card').scrollIntoView({block:'center'})");
    await screenshot("gift-code-credited");
    await submit(gifts[0].code);
    await waitFor("document.querySelector('.gift-code-status').textContent.includes('déjà été utilisé')");
    assert.equal(await balance(), 2800);
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
    const history = await evaluate("fetch('/api/activity').then(r=>r.json())");
    const entries = history.activities;
    assert.equal(entries.filter(row => row.label === "Bonus code cadeau").length, 1);
    console.log("PASS: gift code button/form, invalid/disabled feedback, real balance +500, safe retry, one ledger bonus, no mobile overflow.");
  } finally {
    execFileSync("python3", ["-c", `
import json,sys,auth_backend as db
ids=json.loads(sys.argv[1])
with db.connect() as conn,conn.cursor() as cur:
 cur.execute("DELETE FROM shineray_gift_redemptions WHERE gift_id=ANY(%s)",(ids,))
 cur.execute("DELETE FROM shineray_admin_resources WHERE id=ANY(%s)",(ids,))
`, JSON.stringify(gifts.map(gift => gift.id))]);
  }
};

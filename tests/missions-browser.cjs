const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

module.exports = async ({ userId, call, evaluate, navigate, waitFor, screenshot }) => {
  await navigate("/equipe");
  await waitFor("document.querySelector('.team-missions-link')");
  assert.equal(await evaluate("document.querySelector('.team-missions-link').getAttribute('href')"), "/missions");
  await navigate("/missions");
  await waitFor("document.querySelectorAll('.mission-card').length === 3");
  assert.equal(await evaluate("document.querySelectorAll('.mission-action:not(:disabled)').length"), 0);
  await screenshot("iveco-missions-invitations");
  await navigate("/missions-vip");
  await waitFor("document.querySelectorAll('.mission-card').length === 6");
  assert.equal(await evaluate("document.querySelectorAll('.mission-action:not(:disabled)').length"), 0);
  execFileSync("python3", ["-c", `import auth_backend as db
from psycopg.types.json import Jsonb
with db.connect() as c,c.cursor() as cur:
 cur.execute("""INSERT INTO shineray_transactions
 (user_id,kind,label,amount_fcfa,provider_reference,details)
 VALUES (%s,'purchase','Mission browser purchase',-1,%s,%s)""",
 (${Number(userId)},'mission-browser:${Number(userId)}',Jsonb({'vip':4,'product_code':'VIP4'})))
`]);
  await navigate("/missions-vip");
  await waitFor("document.querySelectorAll('.mission-action:not(:disabled)').length === 1");
  const before = await evaluate("(async()=> (await (await fetch('/api/me')).json()).balance_fcfa)()");
  await evaluate("document.querySelector('.mission-action:not(:disabled)').click()");
  await waitFor("document.querySelector('.mission-card .mission-action').textContent === 'Réclamé'");
  assert.equal(await evaluate("(async()=> (await (await fetch('/api/me')).json()).balance_fcfa)()"), before+500);
  assert.equal(await evaluate("(async()=> (await (await fetch('/api/missions/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mission_id:'purchase-vip4'})})).json()).already_claimed)()"), true);
  assert.equal(await evaluate("(async()=> (await (await fetch('/api/me')).json()).balance_fcfa)()"), before+500);
  for (const width of [390, 900]) {
    await call("Emulation.setDeviceMetricsOverride", {width,height:844,deviceScaleFactor:1,mobile:width<500});
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
  }
  await call("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await screenshot("iveco-missions-vip-claimed");
  assert.equal(await evaluate("(async()=> (await fetch('/api/missions/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mission_id:'invite-3'})})).status)()"), 409);
  console.log("PASS: Missions entry, both real pages, locked progress, VIP claim credits exactly500, retry no doublecredit, unmet409, mobile/desktop fit.");
};

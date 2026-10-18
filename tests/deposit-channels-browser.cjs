const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

module.exports = async ({ evaluate, navigate, waitFor, screenshot }) => {
  const fixture = JSON.parse(execFileSync("python3", ["-c", [
    "import json, auth_backend",
    "from psycopg.types.json import Jsonb",
    "value={'country':'Bénin','countryCode':'+229','operatorName':'MTN test Benin','receiverNumber':'0190123456','receiverName':'Test merchant','isActive':True,'sortOrder':0,'ussdTemplate':'*123*1*1{account}*{amount}#','logoText':'MTN','logoColor':'#ffda28'}",
    "with auth_backend.connect() as conn, conn.cursor() as cur:",
    " cur.execute(\"INSERT INTO shineray_admin_resources(kind,value) VALUES('channel',%s) RETURNING id\",(Jsonb(value),))",
    " print(json.dumps(cur.fetchone()))",
  ].join("\n")], { encoding: "utf8" }));
  try {
    const ready = "document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'";
    await navigate("/recharger");
    await evaluate("document.querySelector('[data-amount-choice=\"8000\"]').click();document.querySelector('[data-payment-action]').click()");
    await waitFor(`location.pathname==='/choisir-operateur' && ${ready}`);
    assert.equal(await evaluate("document.querySelector('[data-deposit-prefix]').textContent"), "+229");
    assert(await evaluate(`Boolean(document.querySelector('[data-operator="${fixture.id}"]'))`));
    await evaluate(`document.querySelector('[data-operator="${fixture.id}"]').click();document.querySelector('#deposit-phone').value='123';document.querySelector('#deposit-operator-form').requestSubmit()`);
    assert((await evaluate("document.querySelector('[data-deposit-status]').textContent")).includes("10"));
    await evaluate("document.querySelector('#deposit-phone').value='0190123456';document.querySelector('#deposit-operator-form').requestSubmit()");
    await waitFor(`location.pathname==='/confirmation-depot' && ${ready}`);
    assert.equal(await evaluate("document.querySelector('[data-merchant-name]').textContent"), "Test merchant");
    assert.equal(await evaluate("document.querySelector('[data-merchant-account]').textContent"), "0190123456");
    assert.equal(await evaluate("document.querySelector('[data-ussd-code]').textContent"), "*123*1*10190123456*8000#");
    assert.equal(await evaluate("document.querySelector('[data-deposit-dial]').getAttribute('href')"), "tel:*123*1*10190123456*8000%23");
    assert.equal(await evaluate("document.querySelector('[data-copy=\"ussd\"]').disabled"), false);
    await evaluate("document.querySelector('[data-deposit-language]').click()");
    assert.equal(await evaluate("document.querySelector('[data-merchant-name]').textContent"), "Test merchant");
    assert.equal(await evaluate("(async()=> (await (await fetch('/api/me')).json()).balance_fcfa)()"), 2300);
    await screenshot("shineray-benin-admin-channel");
    execFileSync("python3", ["-c",
      "import auth_backend,sys\nwith auth_backend.connect() as conn, conn.cursor() as cur:\n cur.execute(\"UPDATE shineray_admin_resources SET value=jsonb_set(value,'{isActive}','false') WHERE id=%s\",(int(sys.argv[1]),))",
      String(fixture.id)]);
    await navigate("/confirmation-depot");
    await waitFor(ready);
    assert.equal(await evaluate("document.querySelector('[data-deposit-missing]').hidden"), false);
    console.log("PASS: real Benin account, configured channel, +229, 10-digit validation, merchant/USSD, language switch, disabled-channel rejection, unchanged balance.");
  } finally {
    execFileSync("python3", ["-c",
      "import auth_backend,sys\nwith auth_backend.connect() as conn, conn.cursor() as cur:\n cur.execute('DELETE FROM shineray_admin_resources WHERE id=%s',(int(sys.argv[1]),))",
      String(fixture.id)]);
  }
};

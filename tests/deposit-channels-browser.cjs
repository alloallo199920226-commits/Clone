const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

module.exports = async ({ call, evaluate, navigate, waitFor, screenshot }) => {
  const fixture = JSON.parse(execFileSync("python3", ["-c", [
    "import json, auth_backend",
    "from psycopg.types.json import Jsonb",
    "value={'country':'Bénin','countryCode':'+229','operatorName':'MTN','receiverNumber':'0190123456','receiverName':'Test merchant','isActive':True,'sortOrder':0,'ussdTemplate':'*123*1*1{account}*{amount}#','logoText':'MTN','logoColor':'#ffda28'}",
    "with auth_backend.connect() as conn, conn.cursor() as cur:",
    " cur.execute(\"INSERT INTO shineray_admin_resources(kind,value) VALUES('channel',%s) RETURNING id\",(Jsonb(value),))",
    " first=cur.fetchone()['id']",
    " value.update({'operatorName':'MOOV','logoText':'Moov Africa','logoColor':'#1683c4'})",
    " cur.execute(\"INSERT INTO shineray_admin_resources(kind,value) VALUES('channel',%s) RETURNING id\",(Jsonb(value),))",
    " print(json.dumps({'id':first,'secondId':cur.fetchone()['id']}))",
  ].join("\n")], { encoding: "utf8" }));
  try {
    const ready = "document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'";
    await navigate("/recharger");
    await evaluate("document.querySelector('[data-amount-choice=\"500\"]').click();document.querySelector('[data-payment-action]').click()");
    await waitFor(`location.pathname==='/choisir-operateur' && ${ready}`);
    assert.equal(await evaluate("document.querySelector('[data-deposit-prefix]').textContent"), "+229");
    assert(await evaluate(`Boolean(document.querySelector('[data-operator="${fixture.id}"]'))`));
    await evaluate("document.fonts.ready");
    await waitFor("[...document.images].every(image=>image.complete)");
    await evaluate("Promise.allSettled(document.getAnimations().map(animation=>animation.finished))");
    for (const width of [320, 390, 472, 768]) {
      await call("Emulation.setDeviceMetricsOverride", {width, height:909, deviceScaleFactor:1, mobile:true});
      const geometry = await evaluate(`(()=>{
        const logos=[...document.querySelectorAll('.operator-logo')].map(n=>n.getBoundingClientRect());
        const buttons=[...document.querySelectorAll('[data-operator]')].map(n=>n.getBoundingClientRect());
        return {overflow:document.documentElement.scrollWidth>innerWidth,
          fontSize:parseFloat(getComputedStyle(document.querySelector('#deposit-phone')).fontSize),
          titleFits:document.querySelector('.deposit-brand').getBoundingClientRect().right<=document.querySelector('.deposit-heading-tools').getBoundingClientRect().left,
          aligned:logos.length===buttons.length && logos.every((r,i)=>Math.abs(r.x+r.width/2-buttons[i].x-buttons[i].width/2)<2),
          row:buttons.length<2 || Math.abs(buttons[0].y-buttons[1].y)<2};
      })()`);
      assert.equal(geometry.overflow, false, `No horizontal overflow at ${width}px`);
      assert(geometry.fontSize >= 16, `No autozoom-size input at ${width}px`);
      assert(geometry.titleFits, `Header controls do not overlap the title at ${width}px`);
      assert(geometry.aligned, `Each logo centered above its own operator at ${width}px`);
      assert(geometry.row, `Two operators remain on same row at ${width}px`);
      if (width === 472 || width === 320) await screenshot(`iveco-payment-${width}`);
    }
    await call("Emulation.setDeviceMetricsOverride", {width:472,height:909,deviceScaleFactor:1,mobile:true});
    await evaluate(`document.querySelector('[data-operator="${fixture.secondId}"]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-operator="${fixture.secondId}"]').getAttribute('aria-pressed')`), "true");
    await evaluate(`document.querySelector('[data-operator="${fixture.id}"]').click();document.querySelector('#deposit-phone').value='123';document.querySelector('#deposit-operator-form').requestSubmit()`);
    assert((await evaluate("document.querySelector('[data-deposit-status]').textContent")).includes("10"));
    await evaluate("document.querySelector('#deposit-phone').value='0190123456';document.querySelector('#deposit-operator-form').requestSubmit()");
    await waitFor(`location.pathname==='/confirmation-depot' && ${ready}`);
    assert.equal(await evaluate("document.querySelector('[data-merchant-name]').textContent"), "Test merchant");
    assert.equal(await evaluate("document.querySelector('[data-merchant-account]').textContent"), "0190123456");
    assert.equal(await evaluate("document.querySelector('[data-ussd-code]').textContent"), "*123*1*10190123456*500#");
    assert.equal(await evaluate("document.querySelector('[data-deposit-dial]').getAttribute('href')"), "tel:*123*1*10190123456*500%23");
    assert.equal(await evaluate("document.querySelector('[data-copy=\"ussd\"]').disabled"), false);
    await evaluate("document.fonts.ready");
    await waitFor("[...document.images].every(image=>image.complete)");
    await evaluate("Promise.allSettled(document.getAnimations().map(animation=>animation.finished))");
    for (const width of [320, 390, 472, 768]) {
      await call("Emulation.setDeviceMetricsOverride", {width,height:909,deviceScaleFactor:1,mobile:true});
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false, `Confirmation overflow at ${width}px`);
      assert.equal(await evaluate("document.querySelector('[data-ussd-code]').scrollWidth>document.querySelector('[data-ussd-code]').clientWidth+1"), false, `Readable code at ${width}px`);
      if (width === 472 || width === 320) await screenshot(`iveco-confirmation-${width}`);
    }
    await call("Page.bringToFront");
    await call("Browser.grantPermissions", {origin:await evaluate("location.origin"),permissions:["clipboardReadWrite","clipboardSanitizedWrite"]});
    for (const [name,value] of Object.entries({merchant_name:"Test merchant",merchant_account:"0190123456",amount:"500",ussd:"*123*1*10190123456*500#"})) {
      await evaluate(`document.querySelector('[data-deposit-status]').textContent='';document.querySelector('[data-copy="${name}"]').click()`);
      await waitFor("Boolean(document.querySelector('[data-deposit-status]').textContent)");
      assert.equal(await evaluate("document.querySelector('[data-deposit-status]').textContent"), "Copié.", `Clipboard feedback for ${name}`);
      assert.equal(await evaluate("navigator.clipboard.readText()"), value, `Real clipboard ${name}`);
    }
    await evaluate("window.savedClipboardWrite=navigator.clipboard.writeText;navigator.clipboard.writeText=()=>Promise.reject(new Error('Test denied'));document.querySelector('[data-copy=\"ussd\"]').click()");
    await waitFor("document.querySelector('[data-deposit-status]').textContent.includes('indisponible')");
    await evaluate("navigator.clipboard.writeText=window.savedClipboardWrite");
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
      "import auth_backend,sys\nwith auth_backend.connect() as conn, conn.cursor() as cur:\n cur.execute('DELETE FROM shineray_admin_resources WHERE id IN (%s,%s)',(int(sys.argv[1]),int(sys.argv[2])))",
      String(fixture.id), String(fixture.secondId)]);
  }
};

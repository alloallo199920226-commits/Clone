const assert = require("node:assert/strict");
module.exports = async ({call, evaluate, navigate, waitFor, screenshot, phone}) => {
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const signal = status => evaluate(`fetch('/api/test/sonarapay',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:${JSON.stringify(status)}})
  }).then(r=>r.json())`);
  const balance = () => evaluate("fetch('/api/me').then(r=>r.json()).then(a=>a.balance_fcfa)");
  const before = await balance();
  await signal("lost");
  await evaluate("sessionStorage.setItem('shineray-deposit-draft',JSON.stringify({amount_fcfa:2500,channel:1,created_at:Date.now()}))");
  await navigate("/choisir-operateur");
  await waitFor("document.querySelector('[data-operator=\"moov_bj\"]')");
  await evaluate(`document.querySelector('[data-operator="moov_bj"]').click();
    document.querySelector('#deposit-phone').value=${JSON.stringify(phone)};
    document.querySelector('#deposit-operator-form').requestSubmit()`);
  await waitFor("location.pathname==='/confirmation-depot' && document.querySelector('[data-sonara-panel]')?.hidden===false");
  await waitFor("document.querySelector('[data-sonara-panel]').textContent.includes('Vérification automatique')");
  assert(await evaluate("document.querySelector('[data-sonara-retry]').hidden"));
  assert.equal(await balance(),before);
  await screenshot("narke-payment-automatic-recovery");
  const state = await signal("successful");
  assert.equal(state.calls,1);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus==='successful'");
  assert.equal(await balance(),before+2500);
  const after = await signal("successful");
  assert.equal(after.calls,1,"Recovery must not repeat a debit");
  assert.equal(after.unique_orders,1);
  await screenshot("narke-payment-recovered-success");
  console.log("PASS: lost creation response → automatic read-only reference recovery → confirmed credit; one creation, one credit; no real provider/payment.");
};

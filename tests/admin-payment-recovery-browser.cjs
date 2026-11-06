const assert = require("node:assert/strict");

module.exports = async ({call, evaluate, navigate, waitFor, screenshot}) => {
  await navigate("/omarshark-junior-panam");
  await waitFor("document.querySelector('#admin-password')");
  await evaluate(`document.querySelector('#admin-password').value='isolated-browser-console-password';
    document.querySelector('#admin-login').requestSubmit()`);
  await waitFor("document.querySelector('#dashboard-view')?.hidden===false");
  await navigate("/administration-depots");
  await waitFor("document.querySelector('[data-admin-deposit-form]')");
  assert(await evaluate("document.body.textContent.includes('Recharge automatique bloquée')"));
  for (const width of [320,390,1280]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:width<900});
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
  }
  // Intercept only this submission. Never create or settle a real payment.
  await evaluate(`window.recoveryRequests=[];
    const originalFetch=window.fetch.bind(window);
    window.fetch=(url,options)=>{
      if(url==='/api/admin/deposits'){
        window.recoveryRequests.push(JSON.parse(options.body));
        return Promise.resolve(new Response(JSON.stringify({already_approved:true}),{
          status:200,headers:{'Content-Type':'application/json'}
        }));
      }
      return originalFetch(url,options);
    };
    document.querySelector('[name=phone]').value='+2290100000000';
    document.querySelector('[name=amount_fcfa]').value='2500';
    document.querySelector('[name=provider_reference]').value='PAY-00000000-0000-4000-8000-000000000000';
    document.querySelector('[name=receipt_verified]').checked=true;
    document.querySelector('[data-admin-deposit-form]').requestSubmit();`);
  await waitFor("document.querySelector('[data-admin-status]').textContent.includes('Aucun crédit')");
  assert.equal(await evaluate("window.recoveryRequests.length"),1);
  await screenshot("narke-admin-payment-recovery");
  console.log("PASS: authenticated recovery page, responsive form, canonical PAY reference submitted; duplicate-credit message; no real settlement.");
};

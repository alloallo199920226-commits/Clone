const assert = require("node:assert/strict");

module.exports = async ({call, evaluate, navigate, waitFor, screenshot}) => {
  // Public merchant fixtures only. No payment, tel: navigation, or credit call.
  for (const template of [
    "*436*1*1*1*account*amount#",
    "*436*1*1*1*{account}*{amount}#",
    " *436*1*1*1*{receiverNumber}*{amount}# ",
    "*436*1*1*1*96900000*2500#",
    "javascript:alert(1)",
  ]) {
    const valid = template !== "javascript:alert(1)";
    const injected = await call("Page.addScriptToEvaluateOnNewDocument", {source: `
      sessionStorage.setItem('shineray-deposit-draft',JSON.stringify({
        amount_fcfa:2500,channel:1,operator:'ussd-fixture',
        phone:'97000000',country_code:'+227',created_at:Date.now()
      }));
      const originalFetch=window.fetch.bind(window);
      window.fetch=(url, options)=>{
        if(url==='/api/payment-channels/me')return Promise.resolve(new Response(JSON.stringify({
          countryCode:'+227',phoneLength:8,channels:[{
            id:'ussd-fixture',operatorName:'AIRTEL',receiverName:'Marchand test',
            receiverNumber:'96900000',ussdTemplate:${JSON.stringify(template)},provider:'manual'
          }]
        }),{status:200,headers:{'Content-Type':'application/json'}}));
        return originalFetch(url, options);
      };
    `});
    try {
      await navigate("/confirmation-depot");
      await waitFor("document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'");
      if (valid) {
        const code = "*436*1*1*1*96900000*2500#";
        assert.equal(await evaluate("document.querySelector('[data-ussd-code]').textContent"), code);
        assert.equal(await evaluate("document.querySelector('[data-deposit-dial]').getAttribute('href')"),
          `tel:${encodeURIComponent(code)}`);
        assert.equal(await evaluate("document.querySelector('[data-copy=ussd]').disabled"), false);
        assert.equal(await evaluate("document.querySelector('.signature-code-wrap').hidden"), false);
        for (const width of [320,390,472]) {
          await call("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:true});
          assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"));
        }
        if (template.includes("*account*")) await screenshot("narke-niger-manual-ussd");
      } else {
        assert.equal(await evaluate("document.querySelector('.signature-code-wrap').hidden"), true);
        assert(await evaluate("document.querySelector('[data-manual-transfer]').textContent.length>0"));
      }
    } finally {
      await call("Page.removeScriptToEvaluateOnNewDocument",{identifier:injected.identifier});
    }
  }
  console.log("PASS: Niger bare/braced/static USSD templates render exact account and amount, dial link and copy; invalid templates remain non-dialable; 320/390/472px; no payment initiated.");
};

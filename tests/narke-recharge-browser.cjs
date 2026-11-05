const assert = require("node:assert/strict");

module.exports = async ({call,evaluate,waitFor,navigate,screenshot}) => {
  const amounts=[3500,7000,12000,20000,40000,75000,100000,150000,250000];
  const setAmount=async amount=>evaluate(`(()=>{
    const input=document.querySelector('#amount'); input.value='${amount}';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await navigate("/recharger");
  assert.equal(await evaluate("document.querySelector('#amount').min"),"3500");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-amount-choice]')].map(e=>Number(e.dataset.amountChoice))"),amounts);
  for (const amount of amounts) {
    await evaluate(`document.querySelector('[data-amount-choice="${amount}"]').click()`);
    assert.equal(await evaluate("Number(document.querySelector('#amount').value)"),amount);
    assert.equal(await evaluate("document.querySelectorAll('[data-amount-choice][aria-pressed=true]').length"),1);
  }
  await setAmount(3555);
  assert.equal(await evaluate("document.querySelectorAll('[data-amount-choice][aria-pressed=true]').length"),0);
  await setAmount(3500);
  assert.equal(await evaluate("document.querySelector('[data-amount-choice=\"3500\"]').getAttribute('aria-pressed')"),"true");
  for (const width of [320,390,393,430,472,768,1280]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:width<700});
    await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
    await waitFor("document.getAnimations().every(a=>a.effect.getComputedTiming().iterations===Infinity||a.playState==='finished')");
    assert(await evaluate("document.body.classList.contains('narke-recharge-page')"));
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),`Overflow at ${width}`);
    assert(await evaluate("parseFloat(getComputedStyle(document.querySelector('.recharge-amount')).borderTopWidth)>=1"),"FCFA frame must survive shared form styles");
    assert(await evaluate(`(()=>{
      const brand=document.querySelector('.brand-header-logo').getBoundingClientRect();
      const header=document.querySelector('.recharge-brand-header').getBoundingClientRect();
      return Math.abs((brand.left+brand.width/2)-(header.left+header.width/2))<2 &&
        header.height===60;
    })()`),"Brand header must retain reference geometry");
    assert(await evaluate("[...document.querySelectorAll('[data-amount-choice],[data-channel-choice]')].every(e=>e.scrollWidth<=e.clientWidth+1)"),`Clipped choice at ${width}`);
    assert.equal(await evaluate("document.querySelectorAll('.instructions li').length"),5);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.amount-options')).gridTemplateColumns.split(' ').length"),4);
    assert.equal(await evaluate("document.querySelector('[data-history-link]').getAttribute('href')"),"/historique-recharges");
    await evaluate("document.querySelector('#amount').focus()");
    assert(await evaluate(`(()=>{
      const s=getComputedStyle(document.querySelector('#amount'));
      return parseFloat(s.fontSize)>=16 && s.outlineStyle==='none' && s.boxShadow==='none';
    })()`),"Avoid iPhone input zoom and colored focus rings");
    await evaluate("document.querySelector('#amount').blur()");
    if(width===472||width===1280) await screenshot(`narke-recharge-${width}`);
  }
  await call("Emulation.setDeviceMetricsOverride",{width:472,height:1000,deviceScaleFactor:1,mobile:true});
  for (const amount of [500,3499,3500.5]) {
    await setAmount(amount);
    await evaluate("document.querySelector('[data-payment-action]').click()");
    assert.equal(await evaluate("location.pathname"),"/recharger");
    assert.equal(await evaluate("document.querySelector('#amount').getAttribute('aria-invalid')"),"true");
    assert(await evaluate("document.querySelector('[data-payment-status]').textContent.replace(/\\s/g,'').includes('3500')"));
  }
  await screenshot("narke-recharge-invalid");
  await evaluate("document.querySelector('[data-amount-choice=\"7000\"]').click()");
  assert.equal(await evaluate("document.querySelector('#amount').hasAttribute('aria-invalid')"),false);
  assert.equal(await evaluate("document.querySelector('[data-payment-status]').textContent"),"");
  await evaluate("document.querySelector('[data-channel-choice=\"1\"]').click()");
  assert.equal(await evaluate("document.querySelector('[data-channel-choice=\"1\"]').getAttribute('aria-pressed')"),"true");
  await setAmount(3555);
  await evaluate("document.querySelector('[data-payment-action]').click()");
  await waitFor("location.pathname==='/choisir-operateur' && document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('amount')"),"3555");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('channel')"),"1");
  assert.deepEqual(await evaluate("(()=>{const d=JSON.parse(sessionStorage.getItem('shineray-deposit-draft'));return [d.amount_fcfa,d.channel]})()"),[3555,1]);
  await navigate("/recharger");
  assert.equal(await evaluate("document.querySelector('#amount').value"),"3555");
  assert.equal(await evaluate("document.querySelector('[data-channel-choice=\"1\"]').getAttribute('aria-pressed')"),"true");
  await evaluate("document.querySelector('[data-amount-choice=\"3500\"]').click()");
  await evaluate("document.querySelector('[data-channel-choice=\"2\"]').click();document.querySelector('[data-payment-action]').click()");
  await waitFor("location.pathname==='/choisir-operateur' && document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy')==='false'");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('channel')"),"2");
  await navigate("/recharger");
  assert.equal(await evaluate("document.querySelector('[data-amount-choice=\"3500\"]').getAttribute('aria-pressed')"),"true");
  await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  assert(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"));
  console.log("PASS: NARKE recharge at seven widths, all nine presets, custom input and restored selection, minimum3500 validation, both real channel routes and draft restoration; no payment submitted.");
};

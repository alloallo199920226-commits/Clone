const assert = require("node:assert/strict");
module.exports = async ({ call, evaluate, navigate, waitFor, screenshot, phone, prefix = "+229" }) => {
  const operatorCount = prefix === "+226" ? 3 : 2;
  const balance = () => evaluate("(async () => (await (await fetch('/api/me')).json()).balance_fcfa)()");
  const openingBalance = await balance();
  assert(Number.isSafeInteger(openingBalance), "Test account balance must come from the server");
  const layoutFailures = [];
  const noProviderBrand = async () => assert(!await evaluate("/sonarapay/i.test(document.body.innerText + ' ' + Array.from(document.querySelectorAll('[aria-label]'), node => node.getAttribute('aria-label')).join(' '))"), "Provider name must not be displayed");
  const premiumLayout = async () => {
    assert.equal(await evaluate("!!document.querySelector('link[href=\"/pages/narke-payment.css\"]')"), true);
    assert(!await evaluate("/IVECO|Valhalla|MAQUETTE|DEMO-NA/.test(document.title+' '+document.body.innerText)"));
    assert(!await evaluate("[...document.querySelectorAll('body *')].some(e=>/narke-(?:payment-ocean|waterline|home-hero)/.test(getComputedStyle(e).backgroundImage))"),
      "Old marine payment composition must not remain");
    assert(await evaluate("(async()=>{const image=new Image();image.src='/pages/assets/ebike-precision.jpg';await image.decode();return image.naturalWidth>0;})()"),
      "New engineering imagery must load");
    assert(await evaluate("[...document.images].every(image=>image.complete&&image.naturalWidth>0)"), "All visible payment assets must load");
    for (const [width,height] of [[320,568],[390,667],[390,844],[472,802],[768,844],[1280,900]]) {
      await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
      assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `Premium payment overflow at ${width}`);
      const geometry = await evaluate(`(() => {
        const card=document.querySelector('.deposit-card').getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.deposit-card a,.deposit-card button,.deposit-card input')]
          .filter(n=>n.getBoundingClientRect().height>0);
        return {top:card.top,bottom:card.bottom,viewport:innerHeight,
          controls:buttons.every(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}),
          height:document.documentElement.scrollHeight,
          parts:[...document.querySelectorAll('.deposit-card-header,.deposit-amount-bar,.deposit-section-title,.deposit-operator-options,.deposit-phone-label,.deposit-phone-wrap,.deposit-form-warning,.deposit-orange-otp,.deposit-submit')].map(n=>[n.className,Math.round(n.getBoundingClientRect().height)])};
      })()`);
      if (!(geometry.controls && geometry.top>=0 && geometry.bottom<=height+1 && geometry.height<=height+1)) {
        await screenshot("ebike-payment-layout-failure");
        layoutFailures.push({width,height,state:await evaluate("document.body.dataset.paymentState || (document.body.classList.contains('narke-recovery')?'recovery':'operator')"),...geometry});
      }
      assert(await evaluate("[...document.querySelectorAll('input')].filter(node=>node.getBoundingClientRect().height>0).every(node=>parseFloat(getComputedStyle(node).fontSize)>=16)"), "No mobile input zoom");
    }
    await call("Emulation.setDeviceMetricsOverride", { width:390, height:844, deviceScaleFactor:1, mobile:true });
  };
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/recharger");
  await evaluate(`sessionStorage.setItem('shineray-deposit-draft', JSON.stringify({
    amount_fcfa:3500,channel:1,created_at:Date.now()
  }))`);
  await navigate("/choisir-operateur");
  await waitFor(`document.querySelectorAll('[data-operator]').length === ${operatorCount}`);
  await noProviderBrand();
  await waitFor("[...document.querySelectorAll('.deposit-operator img')].every(img=>img.complete&&img.naturalWidth>0)");
  assert.equal(await evaluate("document.querySelectorAll('.deposit-operator img').length"),operatorCount);
  await premiumLayout();
  assert.equal(await evaluate("document.querySelector('[data-deposit-prefix]').textContent"), prefix);
  if (prefix === "+228") {
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-operator]')].map(node=>node.dataset.operator)"),
      ["tmoney_tg", "moov_tg"]);
  }
  if (prefix === "+226") {
    assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-operator]')].map(node=>node.dataset.operator)"),
      ["orange_bf", "moov_bf", "telecel_bf"]);
    assert.equal(await evaluate("document.querySelector('[data-orange-otp]').hidden"), false);
    assert(await evaluate("document.querySelector('[data-i18n=\"orangeOtpHelp\"]').textContent.includes('*144*4*6*3500#')"));
    assert(await evaluate("parseFloat(getComputedStyle(document.querySelector('#deposit-orange-otp').parentElement).borderTopWidth)>=1"));
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
    await evaluate(`document.querySelector('#deposit-orange-otp').value='123456';
      document.querySelector('[data-operator="moov_bf"]').click()`);
    assert.equal(await evaluate("document.querySelector('[data-orange-otp]').hidden"), true);
    assert.equal(await evaluate("document.querySelector('#deposit-orange-otp').value"), "");
    await evaluate(`document.querySelector('[data-operator="orange_bf"]').click()`);
    assert.equal(await evaluate("document.querySelector('[data-orange-otp]').hidden"), false);
    for (const amount of [3500, 75000, 7000]) {
      await evaluate(`sessionStorage.setItem('shineray-deposit-draft',JSON.stringify({
        amount_fcfa:${amount},channel:1,created_at:Date.now()
      }))`);
      await navigate("/choisir-operateur");
      await waitFor("document.querySelector('[data-orange-otp]')?.hidden === false");
      assert(await evaluate(`document.querySelector('[data-i18n="orangeOtpHelp"]').textContent.includes('*144*4*6*${amount}#')`));
    }
    await evaluate("document.querySelector('#deposit-orange-otp').scrollIntoView({block:'center'})");
    await screenshot("orange-bf-otp-selection");
    if (process.argv.includes("--otp-display")) {
      console.log("PASS: Orange BF dynamic USSD for3500/75000/7000, visible OTP border, operator toggle clearing; no payment submitted.");
      return;
    }
  }
  // The OTP amount examples above end at 7,000; the financial scenario below
  // deliberately credits one 3,500 top-up, not that last visual example.
  if (prefix === "+226") {
    await evaluate("sessionStorage.setItem('shineray-deposit-draft',JSON.stringify({amount_fcfa:3500,channel:1,created_at:Date.now()}))");
    await navigate("/choisir-operateur");
    await waitFor("document.querySelectorAll('[data-operator]').length === 3");
  }
  assert.equal(await evaluate("document.querySelector('.deposit-notice')"), null);
  await screenshot(prefix === "+226" ? "sonarapay-burkina-operators" : prefix === "+228" ? "sonarapay-togo-operators" : "sonarapay-operators");
  // The operator has accepted the request, but Safari loses its response.
  // While GET recovery is also offline, do not offer another payment submission.
  await evaluate(`window.paymentFetch = window.fetch; window.paymentPosts = 0;
    window.fetch = async (url, options) => {
      if (String(url) === '/api/sonarapay/payments') {
        if (options?.method === 'POST') {
          window.paymentPosts++;
          await window.paymentFetch(url, options);
        }
        throw new TypeError('Load failed');
      }
      return window.paymentFetch(url, options);
    }`);
  await evaluate(`document.querySelector('#deposit-phone').value=${JSON.stringify(phone)};
    document.querySelector('#deposit-operator-form').requestSubmit()`);
  await waitFor("document.querySelector('[type=submit]').textContent.includes('Vérifier mon paiement')");
  assert.match(await evaluate("document.querySelector('[data-deposit-status]').textContent"), /Ne payez pas une seconde fois/);
  assert(!await evaluate("document.body.innerText.includes('Load failed')"));
  await premiumLayout();
  await evaluate("document.querySelector('#deposit-operator-form').requestSubmit()");
  await waitFor("!document.querySelector('[type=submit]').disabled");
  assert.equal(await evaluate("window.paymentPosts"), 1, "Retry after a lost response must be GET-only");
  await screenshot("sonarapay-connection-lost");
  // Reload with connectivity restored: persisted request ID recovers automatically.
  // Recovery can redirect before the source document reaches readyState complete.
  await call("Page.navigate", { url: await evaluate("location.origin + '/choisir-operateur'") });
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
  assert.equal(await evaluate("document.querySelector('[data-sonara-success]').hidden"), true);
  await noProviderBrand();
  assert.equal(await balance(), openingBalance);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.deposit-details')).display"), "none");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.deposit-ussd-card')).display"), "none");
  const paymentPath = await evaluate("location.pathname + location.search");
  assert.match(paymentPath, /confirmation-depot\?payment=/);
  assert.equal(await evaluate("document.querySelector('[data-sonara-redirect]').hidden"), true);
  assert.equal(await evaluate("document.body.dataset.paymentState"), "pending");
  await premiumLayout();
  await new Promise(resolve => setTimeout(resolve, 11000));
  assert.equal(await evaluate("location.pathname + location.search"), paymentPath, "Pending payments must not redirect");
  await screenshot("sonarapay-pending");
  await navigate("/historique-recharges");
  await waitFor("document.querySelector('a[href*=\"confirmation-depot?payment=\"]')");
  assert.match(await evaluate("document.querySelector('[data-activity-list]').textContent"), /Recharge en cours/);
  await noProviderBrand();
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'successful'})})`);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  const successSeenAt = Date.now();
  assert.equal(await evaluate("document.querySelector('[data-sonara-redirect]').hidden"), false);
  assert.match(await evaluate("document.querySelector('[data-sonara-redirect]').textContent"), /accueil.*10 s/);
  await noProviderBrand();
  assert.equal(await balance(), openingBalance + 3500);
  assert.equal(await evaluate("document.querySelector('[data-sonara-success]').hidden"), false);
  assert.equal(await evaluate("document.body.dataset.paymentState"), "successful");
  assert.match(await evaluate("document.querySelector('[data-narke-title]').textContent"), /large/);
  await premiumLayout();
  assert.equal(await evaluate("document.querySelector('[data-sonara-success] h1').textContent"), "Paiement effectué avec succès");
  assert.match(await evaluate("document.querySelector('[data-deposit-clock]').textContent"), /^\d{2}:\d{2}$/);
  assert.equal(await evaluate("document.querySelector('[data-sonara-reference]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-sonara-copy]')"), null);
  assert.match(await evaluate("document.querySelector('[data-payment-display-number]').textContent"), /^\d{11}$/);
  assert.equal(await evaluate("document.querySelector('[data-sonara-panel]').textContent.includes('PAY-')"), false);
  await evaluate("document.querySelector('[data-deposit-language]').click()");
  assert.equal(await evaluate("document.querySelector('[data-sonara-success] h1').textContent"), "Payment completed successfully");
  await noProviderBrand();
  await evaluate("document.querySelector('[data-deposit-language]').click()");
  await call("Emulation.setDeviceMetricsOverride", { width: 472, height: 802, deviceScaleFactor: 1, mobile: true });
  await screenshot("sonarapay-success");
  console.log("Success geometry:", await evaluate(`JSON.stringify(Object.fromEntries(
    ['.narke-payment-intro','.deposit-card','.deposit-confirmation-header','.sonara-success','.deposit-payer-card'].map(selector => {
      const r=document.querySelector(selector).getBoundingClientRect();return [selector,{x:r.x,y:r.y,width:r.width,height:r.height}];
    })))`));
  await waitFor("location.pathname === '/accueil'");
  assert(Date.now() - successSeenAt >= 9700, "Success redirect must wait 10 seconds, not redirect early");
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  await evaluate("document.querySelector('.sonara-history-button').click()");
  await waitFor("location.pathname === '/historique-recharges'");
  await waitFor("document.querySelector('[data-activity-list]').textContent.includes('Succès')");
  await noProviderBrand();
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  assert.equal(await balance(), openingBalance + 3500);
  await evaluate("document.querySelector('[data-deposit-modify]').click()");
  await waitFor("location.pathname === '/choisir-operateur'");
  assert.equal(await balance(), openingBalance + 3500);
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  await evaluate("document.querySelector('.deposit-close').click()");
  await waitFor("location.pathname === '/recharger'");
  await navigate(paymentPath);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'successful'");
  for (const width of [320, 390, 472, 768]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `Overflow at ${width}px`);
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'otp'})})`);
  await evaluate(`sessionStorage.setItem('shineray-deposit-draft', JSON.stringify({
    amount_fcfa:3500,channel:1,created_at:Date.now()
  }))`);
  await navigate("/choisir-operateur");
  await waitFor(`document.querySelectorAll('[data-operator]').length === ${operatorCount}`);
  await evaluate(`document.querySelector('#deposit-phone').value=${JSON.stringify(phone)};
    document.querySelector('#deposit-operator-form').requestSubmit()`);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'otp_required'");
  await premiumLayout();
  await noProviderBrand();
  await screenshot("sonarapay-otp");
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'otp_required'})})`);
  await evaluate("document.querySelector('#sonara-otp').value='123456';document.querySelector('#sonara-otp').form.requestSubmit()");
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
  assert.equal(await evaluate("document.querySelector('#sonara-otp').value"), "");
  assert(!await evaluate("sessionStorage.getItem('shineray-deposit-draft').includes('123456')"));
  assert.equal(await balance(), openingBalance + 3500);
  await evaluate(`fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({status:'failed'})})`);
  await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'failed'");
  const failureSeenAt = Date.now();
  assert.equal(await evaluate("document.querySelector('[data-sonara-success]').hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-sonara-result-title]').textContent"), "Échec du paiement");
  assert.equal(await evaluate("document.querySelector('[data-sonara-status]').getAttribute('role')"), "alert");
  assert.equal(await evaluate("document.body.dataset.paymentState"), "failed");
  assert.equal(await evaluate("document.querySelector('[data-narke-failure]').hidden"), false);
  await premiumLayout();
  assert.equal(await evaluate("document.querySelector('[data-sonara-redirect]').hidden"), false);
  await noProviderBrand();
  assert.equal(await balance(), openingBalance + 3500);
  await screenshot("sonarapay-failed");
  await waitFor("location.pathname === '/accueil'");
  assert(Date.now() - failureSeenAt >= 9700, "Failure redirect must wait 10 seconds");
  assert.equal(await balance(), openingBalance + 3500);
  if (prefix === "+226") {
    await evaluate(`(async () => {
      await fetch('/api/test/sonarapay', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({status:'otp'})});
      sessionStorage.setItem('shineray-deposit-draft', JSON.stringify({
        amount_fcfa:3500,channel:1,created_at:Date.now()
      }));
    })()`);
    await navigate("/choisir-operateur");
    await waitFor("document.querySelectorAll('[data-operator]').length === 3");
    await evaluate(`document.querySelector('#deposit-phone').value=${JSON.stringify(phone)};
      document.querySelector('#deposit-orange-otp').value='123456';
      document.querySelector('#deposit-operator-form').requestSubmit()`);
    await waitFor("document.querySelector('[data-sonara-panel]')?.dataset.paymentStatus === 'pending'");
    assert(!await evaluate("sessionStorage.getItem('shineray-deposit-draft').includes('123456')"));
    assert.equal(await evaluate("document.querySelector('#sonara-otp').value"), "");
    assert.equal(await balance(), openingBalance + 3500);
  }
  assert.deepEqual(layoutFailures, [], "Payment layouts must fit without clipping controls");
  console.log("PASS: automatic success/failure detection, visible failure alert, both 10-second home redirects, no pending redirect, real account/isolated provider, exactly-once credit, initial and follow-up OTP clearing, 6 widths. NO live provider calls.");
};

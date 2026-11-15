/* node --experimental-websocket tests/browser-reference-check.cjs --ebike-suite
   Uses an isolated server/admin password and one removable development account.
   Never submits a deposit, withdrawal, purchase or admin financial command. */
const assert = require("node:assert/strict");
const { randomInt, createHash } = require("node:crypto");

module.exports = async ({call, evaluate, waitFor, navigate, screenshot, trackUser}) => {
  for (const route of ["/connexion","/inscription"]) {
    await navigate(route);
    for (const width of [320,390,1280]) {
      await call("Emulation.setDeviceMetricsOverride",{width,height:width<700?844:900,deviceScaleFactor:1,mobile:width<700});
      await evaluate("document.fonts.ready");
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false,`${route} overflow at ${width}`);
      assert(await evaluate("Boolean(document.querySelector('[data-auth-form]'))"));
      assert.equal(await evaluate("/NARKE|IVECO|SHINERAY/i.test(document.body.innerText+' '+document.title)"),false);
      assert(await evaluate("[...document.querySelectorAll('[data-auth-form] input:not([type=hidden])')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)"));
      await screenshot(`ebike-industrial-${route.slice(1)}-${width}`);
    }
  }
  const phone = "9" + String(randomInt(1e7)).padStart(7, "0");
  const registered = await evaluate(`fetch('/api/auth/register',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({country_code:'+228',phone:${JSON.stringify(phone)},password:'ebike-suite-test-password',referral_code:''})
  }).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(registered.status,201,JSON.stringify(registered.body));
  trackUser(registered.body.user.id);
  const routes = ["/compte","/projet","/equipe","/mon-equipe","/recharger","/retrait",
    "/financement","/historique-recharges","/historique-retraits",
    "/gestion-compte-bancaire","/ajouter-compte-retrait","/notifications",
    "/missions","/missions-vip","/a-propos","/regles","/service-client",
    "/choisir-operateur","/confirmation-depot"];
  const checkPage = async (route,width) => {
    await evaluate("document.fonts.ready");
    await evaluate("new Promise(r=>setTimeout(r,160))");
    const geometry=await evaluate(`(() => {
      const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};
      return {overflow:document.documentElement.scrollWidth>innerWidth,
        legacy:/\\b(?:NARKE|IVECO|SHINERAY)\\b/i.test(document.body.innerText+' '+document.title),
        title:document.title,background:getComputedStyle(document.body).backgroundColor,
        badImages:[...document.images].filter(visible).filter(e=>!e.complete||!e.naturalWidth).map(e=>e.src),
        overflowElements:[...document.querySelectorAll('body *')].filter(e=>visible(e)&&e.getBoundingClientRect().right>innerWidth+2).slice(0,5).map(e=>e.tagName+'.'+e.className),
        cyan:[...document.querySelectorAll('body *')].filter(visible).filter(e=>{
          const c=getComputedStyle(e).color.match(/[\\d.]+/g)?.map(Number);
          return c&&c[0]<80&&c[1]>150&&c[2]>150&&Math.abs(c[1]-c[2])<110;
        }).slice(0,5).map(e=>({element:e.tagName+'.'+e.className,text:e.textContent.slice(0,35)}))};
    })()`);
    await screenshot(`ebike-suite-${route.slice(1)}-${width}`);
    assert.equal(geometry.legacy,false,`Old brand ${route} ${JSON.stringify(geometry)}`);
    assert.equal(geometry.overflow,false,`Overflow ${route} ${width} ${JSON.stringify(geometry)}`);
    assert.deepEqual(geometry.badImages,[],`Broken images ${route}`);
    assert.deepEqual(geometry.cyan,[],`Legacy cyan styling ${route}`);
    console.log(`PASS ${route} ${width}`);
  };
  for (const width of [390,1280]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:width===390?844:900,deviceScaleFactor:1,mobile:width<700});
    for(const route of routes) {
      await navigate(route);
      await checkPage(route,width);
    }
  }
  await call("Emulation.setDeviceMetricsOverride",{width:320,height:740,deviceScaleFactor:1,mobile:true});
  for(const route of ["/compte","/projet","/equipe","/retrait","/ajouter-compte-retrait","/recharger"]) {
    await navigate(route); await checkPage(route,320);
  }
  await navigate("/compte");
  await evaluate("document.querySelector('.gift-code-toggle').click()");
  assert.equal(await evaluate("document.querySelector('#gift-code-panel').hidden"),false);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#gift-code-input')).fontSize"),"16px");
  await screenshot("ebike-suite-gift-open");
  await evaluate("document.querySelector('a[href=\"/a-propos\"]').click()");
  await waitFor("location.pathname==='/a-propos' && document.readyState==='complete'");
  await waitFor("!document.querySelector('.navigation-loader:not([hidden])')");
  await navigate("/equipe");
  for(const level of ["1","2","3"]) {
    await evaluate(`document.querySelector('[data-team-level-tab="${level}"]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-team-level-tab="${level}"]').getAttribute('aria-selected')`),"true");
  }
  for (const route of ["/compte","/equipe","/recharger","/projet"]) {
    await navigate(route);
    assert(await evaluate(`(() => {
      const sources=[...document.images].map(e=>e.currentSrc||e.src).join(' ')+
        [...document.querySelectorAll('body *')].map(e=>getComputedStyle(e).backgroundImage).join(' ');
      return /ebike-(?:atelier|precision|signature|collective)/.test(sources);
    })()`),`New industrial imagery missing on ${route}`);
  }
  // A valid unsent draft is needed to examine the real payment inputs.
  await evaluate(`sessionStorage.setItem('shineray-deposit-draft',JSON.stringify({
    amount:5000,amount_fcfa:5000,channel:2,created_at:Date.now(),
    country_code:'+228',countryCode:'+228',country:'Togo'
  }))`);
  await navigate("/choisir-operateur");
  await waitFor("document.querySelector('#deposit-phone').getBoundingClientRect().height>0");
  await evaluate("document.querySelector('#deposit-phone').value='90123456'");
  assert(await evaluate("parseFloat(getComputedStyle(document.querySelector('#deposit-phone')).fontSize)>=16"));
  await screenshot("ebike-suite-payment-draft");
  const language = await evaluate("Boolean(document.querySelector('[data-deposit-language]'))");
  if(language) {
    await evaluate("document.querySelector('[data-deposit-language]').click()");
    await waitFor("document.documentElement.lang==='en'");
    assert.equal(await evaluate("/NARKE/i.test(document.title+' '+document.body.innerText)"),false);
  }
  await navigate("/omarshark-junior-panam");
  await waitFor("document.querySelector('#login-view')?.hidden===false");
  const original = await evaluate("fetch('/admin-ui/general.js').then(r=>r.text())");
  assert.equal(createHash("sha256").update(original).digest("hex"),
    "7ef5a51fb30564fc1ffc06f1a191ca0ed9ec9bc8f18a7449f514614a4868526c");
  await checkPage("/admin-login",320);
  await evaluate("document.querySelector('#admin-password').value='isolated-browser-console-password';document.querySelector('#admin-login').requestSubmit()");
  await waitFor("document.querySelector('#dashboard-view')?.hidden===false && document.querySelector('#admin-content').textContent.includes('État de la plateforme')");
  await call("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await checkPage("/admin-dashboard",1280);
  console.log("PASS: complete E-BIKE Pro route coverage, three widths, legacy brand removal, real navigation, team tabs, payment language, unchanged imported admin script and signed-in admin.");
};

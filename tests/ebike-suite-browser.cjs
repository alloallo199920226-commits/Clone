/* node --experimental-websocket tests/browser-reference-check.cjs --ebike-suite
   Uses an isolated server/admin password and one removable development account.
   Never submits a deposit, withdrawal, purchase or admin financial command. */
const assert = require("node:assert/strict");
const { randomInt, createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");

module.exports = async ({call, evaluate, waitFor, navigate, screenshot, trackUser}) => {
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
    if (!route.startsWith("/admin-")) {
      await waitFor("document.querySelectorAll('[data-ebike-shell]').length===1");
      assert(await evaluate("document.body.classList.contains('ebike-redesigned')"), `Missing structural redesign ${route}`);
    }
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
    const clipped = await evaluate(`(() => {
      const fields=[...document.querySelectorAll('main input:not([type=hidden]):not([type=checkbox]):not([type=radio]),main select,main textarea')];
      return fields.filter(e=>{
        const r=e.getBoundingClientRect(); if(!r.width||!r.height)return false;
        let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right);
        for(let p=e.parentElement;p;p=p.parentElement){
          const s=getComputedStyle(p),b=p.getBoundingClientRect();
          if(/hidden|clip|auto|scroll/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}
        }
        return right-left<r.width*.95;
      }).map(e=>e.id||e.name||e.tagName);
    })()`);
    assert.deepEqual(clipped,[],`Clipped form controls ${route} ${width}`);
    assert(await evaluate("[...document.querySelectorAll('.ebike-level-icon')].every(e=>e.getBoundingClientRect().width<=32)"),"Oversized referral icons");
    if (route === "/retrait") assert(await evaluate("document.querySelector('.vehicle-balance img').getBoundingClientRect().height <= document.querySelector('.vehicle-balance').getBoundingClientRect().height+1"),"Withdrawal image escaped its frame");
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
  // Populate only this removable account to verify real rendered records and contracts.
  const offer = await evaluate("fetch('/api/products/catalog').then(r=>r.json()).then(p=>p.products.find(x=>x.active&&/^VIP[0-9]+$/.test(x.code)))");
  assert(offer, "A real catalog offer is needed for this development fixture");
  execFileSync("python3",["-c",`
import auth_backend,json,sys
from psycopg.types.json import Jsonb
uid=int(sys.argv[1]);p=json.loads(sys.argv[2])
with auth_backend.connect() as conn,conn.cursor() as cur:
 details={'vip':int(p['code'][3:]),'quantity':1,'daily_income_fcfa':p['dailyIncome'],'total_income_fcfa':p['totalIncome'],'validity_days':p['durationDays'],'income_fcfa':0}
 cur.execute("INSERT INTO shineray_transactions (user_id,kind,label,amount_fcfa,provider_reference,details) VALUES (%s,'purchase',%s,%s,%s,%s)",(uid,p['code'],-p['price'],f'ebike-geometry-product:{uid}',Jsonb(details)))
 cur.execute("INSERT INTO shineray_transactions (user_id,kind,label,amount_fcfa,provider_reference,details) VALUES (%s,'recharge','Dépôt de test de présentation',5000,%s,%s)",(uid,f'ebike-geometry-deposit:{uid}',Jsonb({})))
`,String(registered.body.user.id),JSON.stringify(offer)],{stdio:"inherit"});
  await navigate("/projet");
  await waitFor("document.querySelectorAll('[data-product-id]').length===1 && document.querySelector('[data-products-list]').getAttribute('aria-busy')==='false'");
  const contract = await evaluate("document.querySelector('[data-product-id]').textContent");
  for (const value of [offer.price,offer.dailyIncome,offer.totalIncome]) assert(contract.includes(new Intl.NumberFormat("en-US").format(value)),`Lost contract amount ${value}`);
  const expanded = await evaluate("document.querySelector('[data-product-id]').getBoundingClientRect().height");
  await screenshot("ebike-suite-product-populated");
  await evaluate("document.querySelector('.ebike-product-summary').click()");
  assert(await evaluate(`document.querySelector('[data-product-id]').getBoundingClientRect().height<${expanded}`),"Product detail collapse failed");
  await navigate("/historique-recharges");
  await waitFor("document.querySelector('.reference-activity-card')");
  assert(await evaluate("document.querySelector('[data-activity-list]').textContent.includes('5,000')"));
  await screenshot("ebike-suite-history-populated");
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
  await evaluate("document.querySelector('[data-suite-menu-button]').click()");
  assert.equal(await evaluate("document.querySelector('.ebike-navigation-drawer').open"),true);
  assert.equal(await evaluate("document.querySelectorAll('.ebike-drawer-grid > a').length"),8);
  await screenshot("ebike-suite-navigation-drawer");
  await evaluate("document.querySelector('[data-menu-close]').click()");
  assert.equal(await evaluate("document.querySelector('[data-suite-menu-button]').getAttribute('aria-expanded')"),"false");
  await navigate("/accueil");
  await waitFor("document.querySelector('.platform-notification-dialog')?.open");
  assert.equal(await evaluate("document.querySelectorAll('.platform-notification-dialog .ebike-notice-summary > div').length"),2);
  assert.equal(await evaluate("document.querySelectorAll('.platform-notification-dialog .ebike-notice-block').length"),4);
  await screenshot("ebike-suite-notification-open");
  await evaluate("document.querySelector('.platform-notification-dialog .ebike-notice-confirm').scrollIntoView()");
  await screenshot("ebike-suite-notification-footer");
  await evaluate("document.querySelector('.platform-notification-dialog .ebike-notice-confirm').click()");
  assert.equal(await evaluate("document.querySelector('.platform-notification-dialog').open"),false);
  await evaluate("document.querySelector('[data-notification-open]').click()");
  await waitFor("document.querySelector('.platform-notification-dialog')?.open");
  await evaluate("document.querySelector('.platform-notification-dialog .ebike-notice-close').click()");
  assert.equal(await evaluate("document.querySelector('.platform-notification-dialog').open"),false);
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

const assert = require("node:assert/strict");
const {randomInt} = require("node:crypto");

module.exports = async ({call, evaluate, waitFor, navigate, screenshot, trackUser}) => {
  const phone = "9" + String(randomInt(1e7)).padStart(7, "0");
  const password = "narke-browser-fixture-password";
  const registered = await evaluate(`fetch('/api/auth/register',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({country_code:'+228',phone:${JSON.stringify(phone)},
      password:${JSON.stringify(password)},referral_code:''})
    }).then(async response=>({status:response.status,body:await response.json()}))`);
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  trackUser(registered.body.user.id);
  await evaluate("fetch('/api/auth/logout',{method:'POST'})");
  await navigate("/connexion");
  await waitFor("document.querySelector('[data-password-toggle]') && document.querySelector('.hero-image')?.naturalWidth>0");
  assert(await evaluate("document.querySelector('h1').textContent.includes('Connexion à votre compte')"));
  for (const width of [320,390,393,402,430,472,1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height: width === 472 ? 819 : 844,
      deviceScaleFactor:1, mobile:width<800,
    });
    assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `Overflow at ${width}`);
    assert(await evaluate(`['#login-phone','#login-password'].every(selector=>{
      const field=document.querySelector(selector), box=field.getBoundingClientRect();
      return parseFloat(getComputedStyle(field).fontSize)>=16 && box.left>=0 && box.right<=innerWidth;
    })`), `Field dimensions at ${width}`);
    if (width===472 || width===390 || width===1280) await screenshot(`narke-login-${width}`);
  }
  await call("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate(`document.querySelector('#login-phone').value=${JSON.stringify(phone)};
    document.querySelector('#login-password').value='incorrect-fixture-password';
    document.querySelector('.primary-button').click();`);
  await waitFor("document.querySelector('.demo-notice').textContent.includes('pays')");
  await evaluate("document.querySelector('.country-trigger').click()");
  await waitFor("document.querySelector('[data-country-overlay]').dataset.stage==='ready'");
  await screenshot("narke-country-selector");
  await evaluate("document.querySelector('[data-country-code=\"+228\"]').click()");
  assert.equal(await evaluate("document.querySelector('[name=country]').value"), "+228");
  await evaluate("document.querySelector('#login-phone').focus()");
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#login-phone')).backgroundColor"),
    "rgb(233, 238, 243)", "The shared input reset must not create a pale block on the marine field.");
  await call("Emulation.setEmulatedMedia", {features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  assert(await evaluate("parseFloat(getComputedStyle(document.querySelector('.hero-art'),'::after').animationDuration)<=0.00001"));
  await call("Emulation.setEmulatedMedia", {features:[]});
  await evaluate(`document.querySelector('#login-phone').value=${JSON.stringify(phone)};
    document.querySelector('#login-password').value='incorrect-fixture-password';
    document.querySelector('[data-password-toggle]').click();`);
  assert.equal(await evaluate("document.querySelector('#login-password').type"), "text");
  assert.equal(await evaluate("document.querySelector('[data-password-toggle]').getAttribute('aria-pressed')"), "true");
  await evaluate("document.querySelector('[data-password-toggle]').click()");
  assert.equal(await evaluate("document.querySelector('#login-password').type"), "password");
  await evaluate("document.querySelector('[data-auth-form]').requestSubmit()");
  await waitFor("!document.querySelector('.auth-submit-loading').hidden");
  await waitFor("document.querySelector('.demo-notice').textContent.length>0 && document.querySelector('.auth-submit-loading').hidden");
  assert.equal(await evaluate("location.pathname"), "/connexion");
  await screenshot("narke-login-error");
  await evaluate(`document.querySelector('#login-password').value=${JSON.stringify(password)};
    document.querySelector('[name=remember]').checked=true;
    document.querySelector('[data-auth-form]').requestSubmit();`);
  await waitFor("location.pathname==='/accueil' && document.readyState==='complete'");
  assert.equal(await evaluate("fetch('/api/me').then(r=>r.json()).then(user=>user.id)"), registered.body.user.id);
  await evaluate("fetch('/api/auth/logout',{method:'POST'})");
  await navigate("/connexion");
  await evaluate("document.querySelector('.switch-copy a').click()");
  await waitFor("location.pathname==='/inscription' && document.readyState==='complete'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.primary-button')).backgroundColor"), "rgb(223, 13, 37)");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.auth-card')).backgroundImage"), "none");
  console.log("PASS: NARKE login responsive across 7 widths, real country picker, password toggle, missing-country and invalid-credential errors, successful real fixture login/session, remember option and registration link. No payment or real customer affected.");
};

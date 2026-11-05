const assert = require("node:assert/strict");
const {randomInt} = require("node:crypto");
const {execFileSync} = require("node:child_process");

module.exports = async ({call,evaluate,waitFor,navigate,screenshot,trackUser,trackChild}) => {
  const phone = () => "9"+String(randomInt(1e7)).padStart(7,"0");
  const password = "narke-signup-fixture-password";
  const sponsor = await evaluate(`fetch('/api/auth/register',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({country_code:'+228',phone:${JSON.stringify(phone())},
      password:${JSON.stringify(password)},referral_code:''})
    }).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(sponsor.status,201,JSON.stringify(sponsor.body));
  trackUser(sponsor.body.user.id);
  const referral = await evaluate("fetch('/api/me').then(r=>r.json()).then(user=>user.referral_code)");
  assert.match(referral,/^[A-Za-z0-9]{6,10}$/);
  await evaluate("fetch('/api/auth/logout',{method:'POST'})");
  await navigate("/inscription?c="+encodeURIComponent(referral));
  await waitFor("document.querySelectorAll('[data-password-toggle]').length===2 && document.querySelector('.hero-image').naturalWidth>0");
  assert.equal(await evaluate("document.querySelector('#signup-referral').value"),referral);
  assert(await evaluate("document.title.includes('NARKE')"));
  for (const width of [320,390,430,472,1280]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:844,deviceScaleFactor:1,mobile:width<800});
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"),`Overflow at ${width}`);
    assert(await evaluate(`['#signup-phone','#signup-password','#signup-confirm','#signup-referral'].every(selector=>{
      const input=document.querySelector(selector),box=input.getBoundingClientRect();
      return parseFloat(getComputedStyle(input).fontSize)>=16 && box.left>=0 && box.right<=innerWidth;
    })`),`Clipped fields or small input text at ${width}`);
    if (width===390 || width===1280) await screenshot(`narke-signup-${width}`);
  }
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const childPhone=phone();
  await evaluate(`document.querySelector('#signup-phone').value=${JSON.stringify(childPhone)};
    document.querySelector('#signup-password').value=${JSON.stringify(password)};
    document.querySelector('#signup-confirm').value=${JSON.stringify(password)};
    document.querySelector('[data-auth-form]').requestSubmit();`);
  await waitFor("document.querySelector('.demo-notice').textContent.includes('pays')");
  await evaluate("document.querySelector('.country-trigger').click()");
  await waitFor("document.querySelector('[data-country-overlay]').dataset.stage==='ready'");
  await evaluate("document.querySelector('[data-country-code=\"+228\"]').click()");
  assert.equal(await evaluate("document.querySelector('[name=country]').value"),"+228");
  for (const id of ["signup-password","signup-confirm"]) {
    await evaluate(`document.querySelector('[aria-controls="${id}"]').click()`);
    assert.equal(await evaluate(`document.getElementById('${id}').type`),"text");
    assert.equal(await evaluate(`document.querySelector('[aria-controls="${id}"]').getAttribute('aria-pressed')`),"true");
    await evaluate(`document.querySelector('[aria-controls="${id}"]').click()`);
    assert.equal(await evaluate(`document.getElementById('${id}').type`),"password");
  }
  await evaluate("document.querySelector('#signup-confirm').value='mismatched-password'; document.querySelector('#signup-confirm').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('#signup-confirm').checkValidity()"),false);
  await evaluate(`document.querySelector('#signup-confirm').value=${JSON.stringify(password)};
    document.querySelector('#signup-confirm').dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#signup-referral').value='bad!';`);
  assert.equal(await evaluate("document.querySelector('#signup-referral').checkValidity()"),false);
  await evaluate("document.querySelector('#signup-referral').value=''");
  assert.equal(await evaluate("document.querySelector('#signup-referral').checkValidity()"),true);
  await evaluate(`document.querySelector('#signup-referral').value=${JSON.stringify(referral)};
    document.querySelector('[data-auth-form]').requestSubmit();`);
  await waitFor("location.pathname==='/accueil' && document.readyState==='complete'");
  const user = await evaluate("fetch('/api/me').then(r=>r.json())");
  trackChild(user.id);
  assert(Number.isSafeInteger(user.id));
  assert.notEqual(user.id,sponsor.body.user.id);
  execFileSync("python3",["-c",
    "import sys,auth_backend\nwith auth_backend.connect() as conn,conn.cursor() as cur:\n cur.execute('SELECT referred_by FROM shineray_users WHERE id=%s',(int(sys.argv[1]),))\n assert cur.fetchone()['referred_by']==int(sys.argv[2])",
    String(user.id),String(sponsor.body.user.id)]);
  await evaluate("fetch('/api/auth/logout',{method:'POST'})");
  await navigate("/inscription");
  await evaluate("document.querySelector('.switch-copy a').click()");
  await waitFor("location.pathname==='/connexion' && document.readyState==='complete'");
  console.log("PASS: NARKE registration across five widths, real country selection, both password toggles, password matching, optional referral validation and prefill, real signup/session with verified sponsor association, and return-to-login link. Fixtures cleaned by harness.");
};

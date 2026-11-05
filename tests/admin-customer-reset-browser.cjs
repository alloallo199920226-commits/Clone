/* UI-only deletion responses are intercepted. Never reset development users. */
const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot }) => {
  await navigate("/omarshark-junior-panam");
  await waitFor("document.querySelector('#narke-customer-reset-trigger')");
  assert(await evaluate("!document.querySelector('#narke-customer-reset-trigger').checkVisibility()"));
  await evaluate(`document.querySelector('#admin-password').value='isolated-browser-console-password';
    document.querySelector('#admin-login').requestSubmit()`);
  await waitFor("document.querySelector('#narke-customer-reset-trigger').checkVisibility()");
  for (const width of [320, 390, 472, 760, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height: 844, deviceScaleFactor: 1, mobile: width < 900,
    });
    assert(await evaluate(`(()=>{
      const button=document.querySelector('#narke-customer-reset-trigger');
      const b=button.getBoundingClientRect();
      const h=document.querySelector('.admin-header').getBoundingClientRect();
      const text=document.createRange();text.selectNodeContents(button);
      const t=text.getBoundingClientRect();
      return b.width>150 && b.height<=80 && b.top>=h.top && b.bottom<=h.bottom+1 &&
        t.left>=b.left && t.right<=b.right+1 && t.bottom<=b.bottom &&
        document.documentElement.scrollWidth<=innerWidth;
    })()`), `Reset button must remain readable inside header at ${width}px`);
    if (width===390) await screenshot("narke-admin-header-mobile");
  }
  await evaluate(`window.resetPosts=0;window.resetPreviews=0;
    const originalFetch=window.fetch.bind(window);
    window.fetch=async (url,options={})=>{
      if(url==='/api/admin/customer-reset/preview'){
        window.resetPreviews++;
        return new Response(JSON.stringify({customer_count:2817,activity_count:12380,
          pending_withdrawals:984,pending_deposits:7,preview_token:'ui-fixture',
          expires_in:300}),{status:200,headers:{'Content-Type':'application/json'}});
      }
      if(url==='/api/admin/customer-reset'){
        window.resetPosts++;window.resetBody=JSON.parse(options.body);
        if(window.expireReset) return new Response(JSON.stringify({error:'Aperçu expiré'}),
          {status:410,headers:{'Content-Type':'application/json'}});
        await new Promise(resolve=>setTimeout(resolve,250));
        return new Response(JSON.stringify({ok:true,deleted_customers:2817,
          deleted_activities:12380,already_completed:false}),
          {status:200,headers:{'Content-Type':'application/json'}});
      }
      return originalFetch(url,options);
    };
    document.querySelector('#narke-customer-reset-trigger').click()`);
  await waitFor("document.querySelector('[data-count=customers]').textContent.replace(/\\s/g,'')==='2817'");
  assert.equal(await evaluate("window.resetPosts"), 0);
  assert.equal(await evaluate("document.querySelector('.narke-reset-submit').disabled"), true);
  for (const width of [320, 390, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height: 844, deviceScaleFactor: 1, mobile: width < 900,
    });
    assert(await evaluate(`(()=>{const d=document.querySelector('#narke-customer-reset-dialog');
      const r=d.getBoundingClientRect();
      return r.left>=-1 && r.right<=innerWidth+1 && r.top>=-1 &&
        r.bottom<=innerHeight+1 && d.scrollWidth<=d.clientWidth+2})()`),
      `Reset dialog must fit ${width}px`);
  }
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await screenshot("narke-customer-reset-confirmation");
  await evaluate("document.querySelector('.narke-reset-cancel').click()");
  assert.equal(await evaluate("window.resetPosts"), 0);
  await evaluate(`document.querySelector('#narke-customer-reset-trigger').click();
    const password=document.querySelector('#narke-reset-password');
    password.value='isolated-browser-console-password';
    password.dispatchEvent(new Event('input'));
    document.querySelector('#narke-reset-backup').click()`);
  const focusedField = await evaluate(`(()=>{
    const input=document.querySelector('#narke-reset-confirmation');input.focus();
    const s=getComputedStyle(input);
    return {color:s.color,background:s.backgroundColor,font:s.fontSize,fill:s.webkitTextFillColor};
  })()`);
  assert.equal(focusedField.color, "rgb(255, 255, 255)");
  assert.equal(focusedField.background, "rgb(3, 36, 49)");
  assert.equal(focusedField.font, "16px");
  assert.equal(focusedField.fill, "rgb(255, 255, 255)");
  assert.equal(await evaluate("document.querySelector('.narke-reset-submit').disabled"), true);
  await evaluate(`const confirmation=document.querySelector('#narke-reset-confirmation');
    confirmation.value='SUPPRIMER LES UTILISATEURS';confirmation.dispatchEvent(new Event('input'));
    window.expireReset=true;document.querySelector('.narke-reset-submit').click()`);
  await waitFor("!document.querySelector('.narke-reset-preview').hidden");
  assert.equal(await evaluate("document.querySelector('#narke-reset-password').value"), "");
  await evaluate(`window.expireReset=false;document.querySelector('.narke-reset-preview').click()`);
  await waitFor("window.resetPreviews===2 && document.querySelector('.narke-reset-preview').hidden");
  await evaluate(`document.querySelector('#narke-reset-password').value='isolated-browser-console-password';
    document.querySelector('#narke-reset-password').dispatchEvent(new Event('input'));
    document.querySelector('.narke-reset-submit').click();
    document.querySelector('.narke-reset-submit').click()`);
  await waitFor("!document.querySelector('.narke-reset-refresh').hidden");
  assert.equal(await evaluate("window.resetPosts"), 2); // One expired and one success.
  assert.equal(await evaluate("window.resetBody.confirmation"), "SUPPRIMER LES UTILISATEURS");
  assert.equal(await evaluate("window.resetBody.backup_confirmed"), true);
  assert(await evaluate("document.querySelector('.narke-reset-status').textContent.includes('Suppression terminée')"));
  await screenshot("narke-customer-reset-success");
  console.log("PASS: admin-only reset UI, preview, three widths, confirmation gating, cancellation, expiry, duplicate click protection, password cleared and server-confirmed success. No real customer deletion.");
};

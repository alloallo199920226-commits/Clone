const assert = require("node:assert/strict");

module.exports = async ({call, evaluate, navigate, waitFor, screenshot, owner}) => {
  await navigate("/omarshark-junior-panam");
  await waitFor("document.querySelector('#admin-password')");
  await evaluate(`document.querySelector('#admin-password').value='isolated-browser-console-password';
    document.querySelector('#admin-login').requestSubmit()`);
  await waitFor("document.querySelector('#dashboard-view')?.hidden===false");
  await evaluate("document.querySelector('[data-tab=users]').click()");
  await waitFor("document.querySelector('[data-admin-user-search]')");
  await evaluate(`const search=document.querySelector('[data-admin-user-search]');
    search.value=${JSON.stringify(owner.phone)};search.dispatchEvent(new Event('input',{bubbles:true}))`);
  await waitFor(`document.querySelector('[data-user="${owner.id}"]')`);
  await evaluate(`document.querySelector('[data-user="${owner.id}"]').click()`);
  await waitFor("document.querySelector('.admin-user-panel')");
  for (const width of [320, 390, 472, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {width,height:844,deviceScaleFactor:1,mobile:width<900});
    for (const field of ["credit", "debit"]) {
      const result = await evaluate(`(()=>{
        const input=document.querySelector('.admin-user-panel [name="${field}"]');
        input.value='1500';input.focus();
        const css=getComputedStyle(input), placeholder=getComputedStyle(input,'::placeholder');
        const rect=input.getBoundingClientRect();
        return {value:input.value,color:css.color,fill:css.webkitTextFillColor,
          background:css.backgroundColor,placeholder:placeholder.color,
          opacity:css.opacity,fits:rect.left>=0&&rect.right<=innerWidth+1};
      })()`);
      assert.equal(result.value, "1500");
      assert.equal(result.color, "rgb(245, 251, 255)");
      assert.equal(result.fill, "rgb(245, 251, 255)");
      assert.equal(result.background, "rgb(0, 40, 56)");
      assert.equal(result.placeholder, "rgb(196, 220, 230)");
      assert.equal(result.opacity, "1");
      assert(result.fits, `${field} must fit at ${width}px`);
    }
    await evaluate("document.querySelector('.admin-user-panel').scrollTop=0;document.activeElement.blur()");
    if (width === 390) await screenshot("narke-admin-user-drawer");
  }
  await call("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate("document.querySelector('[data-user-trace]').click()");
  await waitFor("document.querySelector('.admin-trace-dialog [data-trace-results] .trace-card')");
  assert.equal(await evaluate("document.querySelector('.admin-trace-dialog input[name=user]').value"), String(owner.id));
  assert(await evaluate("document.querySelector('.admin-trace-dialog').textContent.includes('Bonus de bienvenue')"));
  assert(await evaluate("document.querySelector('.admin-trace-dialog').textContent.includes('ce n’est pas un dépôt réel')"));
  await screenshot("narke-admin-transaction-trace");
  await evaluate("document.querySelector('.admin-trace-dialog select').value='commission';document.querySelector('.admin-trace-dialog form').requestSubmit()");
  await waitFor("document.querySelector('.admin-trace-dialog [data-trace-results]').textContent.includes('Aucune écriture')");
  await evaluate(`window.traceOriginalFetch = window.fetch;
    window.fetch = async (url, options) => {
      if(String(url).startsWith('/api/admin/transaction-trace?')) return new Response(JSON.stringify({
        total:1,nextCursor:null,transactions:[{
          id:987654,user_id:${owner.id},phone:${JSON.stringify(owner.phone)},kind:'commission',
          label:'Commission niveau 1',amount_fcfa:1000,provider_reference:'first-deposit:777:level:1',
          created_at:'2026-11-06T10:44:40Z',source_phone:'+22890000000 <script>bad()</script>',
          source_user_id:777,deposit_amount:2500,deposit_id:777,deposit_reference:'trace-test-reference',
          approval_method:'automatic',approved_at:'2026-11-06T10:44:40Z',
          details:{level:1,rate_percent:40,base_amount_fcfa:2500}
        }]
      }),{status:200,headers:{'Content-Type':'application/json'}});
      return window.traceOriginalFetch(url,options);
    };
    document.querySelector('.admin-trace-dialog form').requestSubmit();`);
  await waitFor("document.querySelector('.admin-trace-dialog [data-trace-results]').textContent.includes('trace-test-reference')");
  for (const text of ["Filleul à l’origine du dépôt", "2 500 FCFA", "40 %", "Premier dépôt approuvé du filleul"]) {
    assert(await evaluate(`document.querySelector('.admin-trace-dialog').textContent.includes(${JSON.stringify(text)})`), text);
  }
  assert.equal(await evaluate("document.querySelectorAll('.admin-trace-dialog [data-trace-results] script').length"), 0);
  assert(await evaluate("document.querySelector('.admin-trace-dialog').textContent.includes('<script>bad()</script>')"));
  await screenshot("narke-admin-commission-trace");
  await evaluate("window.fetch=window.traceOriginalFetch;delete window.traceOriginalFetch");
  await evaluate("document.querySelector('[data-trace-close]').click();document.querySelector('.admin-user-panel button')?.focus()");
  console.log("PASS: actual user drawer readable at 320/390/472/1280px; credit/debit text, placeholders and NARKE surfaces; no financial operation submitted.");
  console.log("PASS: authenticated user-specific trace, welcome-bonus origin, commission filter and empty state.");
};

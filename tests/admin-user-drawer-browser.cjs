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
  console.log("PASS: actual user drawer readable at 320/390/472/1280px; credit/debit text, placeholders and NARKE surfaces; no financial operation submitted.");
};

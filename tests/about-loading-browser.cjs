const assert = require("node:assert/strict");

module.exports = async ({call, evaluate, waitFor, navigate, screenshot, paused, base}) => {
  const active = "document.documentElement.classList.contains('site-navigation-pending')";
  const heroPath = "/pages/assets/iveco-about-fleet.jpg";
  const lazyPath = "/pages/assets/iveco-about-power.jpg";
  const waitPaused = async path => {
    for (let attempt = 0; attempt < 100 && !paused.has(path); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(paused.has(path), `Expected held image ${path}`);
    return paused.get(path);
  };
  await call("Emulation.setDeviceMetricsOverride", {width:390, height:844, deviceScaleFactor:1, mobile:true});
  await call("Network.setCacheDisabled", {cacheDisabled:true});
  await navigate("/compte");
  paused.clear();
  await call("Fetch.enable", {patterns:[
    {urlPattern:base + heroPath, requestStage:"Request"},
    {urlPattern:base + lazyPath, requestStage:"Request"},
  ]});
  // The previous About test used a direct URL, bypassing the navigation marker.
  await evaluate("document.querySelector('a[href=\"/a-propos\"]').click()");
  const heroRequest = await waitPaused(heroPath);
  await waitFor("location.pathname === '/a-propos' && document.readyState !== 'loading'");
  assert.equal(await evaluate(active), true, "Still wait for the eager hero image");
  await call("Fetch.continueRequest", {requestId:heroRequest});
  await waitFor("!document.documentElement.classList.contains('site-navigation-pending')");
  assert.equal(await evaluate("document.body.inert"), false);
  assert.equal(await evaluate("sessionStorage.getItem('shineray-page-navigation')"), null);
  assert(await evaluate("[...document.querySelectorAll('img[loading=\"lazy\"]')].some(image=>!image.complete)"),
    "Page must open before all lazy images are loaded");
  assert(await evaluate("document.querySelector('.about-opening h2').getBoundingClientRect().height > 0"));
  assert(await evaluate("[...document.styleSheets].filter(sheet=>sheet.href?.includes('iveco-about.css')).every(sheet=>![...sheet.cssRules].some(rule=>rule.type===CSSRule.IMPORT_RULE))"));
  await screenshot("iveco-about-navigation-ready");

  await evaluate(`document.querySelector('img[src="${lazyPath}"]').scrollIntoView({block:'center'})`);
  const lazyRequest = await waitPaused(lazyPath);
  assert.equal(await evaluate(active), false, "A slow offscreen image must not reopen the loader");
  await call("Fetch.failRequest", {requestId:lazyRequest, errorReason:"Failed"});
  await waitFor(`document.querySelector('img[src="${lazyPath}"]').complete`);
  assert.equal(await evaluate(active), false, "Image failure must not block readable content");
  assert.equal(await evaluate("document.body.inert"), false);
  await call("Fetch.disable");

  await evaluate("document.querySelector('.about-page .back').click()");
  await waitFor("location.pathname === '/compte' && !document.documentElement.classList.contains('site-navigation-pending')");
  assert.equal(await evaluate("document.body.inert"), false);
  await evaluate("document.querySelector('a[href=\"/a-propos\"]').click()");
  await waitFor("location.pathname === '/a-propos' && !document.documentElement.classList.contains('site-navigation-pending')");
  await call("Page.reload", {ignoreCache:true});
  await waitFor("location.pathname === '/a-propos' && document.readyState !== 'loading' && !document.documentElement.classList.contains('site-navigation-pending')");
  assert.equal(await evaluate("document.body.inert"), false);
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
  await call("Network.setCacheDisabled", {cacheDisabled:false});
  console.log("PASS: actual account → About navigation; eager image still awaited, lazy images never block reading, slow/failed lazy image leaves page interactive, account return/re-entry/reload work. No external font import.");
};

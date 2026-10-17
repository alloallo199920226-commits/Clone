const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, paused, base }) => {
  const active = "document.documentElement.classList.contains('site-navigation-pending')";
  const intercept = async () => {
    paused.clear();
    await call("Fetch.enable", { patterns: [
      { urlPattern: base + "/api/activity*", requestStage: "Request" },
      { urlPattern: base + "/api/products", requestStage: "Request" },
    ] });
  };
  const waitPaused = async path => {
    for (let attempt = 0; attempt < 100 && !paused.has(path); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(paused.has(path), `Expected pending request ${path}`);
    return paused.get(path);
  };
  await navigate("/compte");
  assert.equal(await evaluate(active), false);
  await intercept();
  // Hold only the outgoing paint callback; pausing a native document request
  // suspends its old execution context and makes CDP evaluation unreliable.
  await evaluate("window.__navigationFrame=requestAnimationFrame; window.requestAnimationFrame=callback=>(window.__outgoingNavigation=callback,0)");
  await evaluate("document.querySelector('a[href=\"/financement\"]').click()");
  assert.equal(await evaluate(active), true);
  assert.equal(await evaluate("document.body.inert"), true);
  const bounds = await evaluate(`(() => {
    const r=document.querySelector('.site-navigation-spinner').getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight,
      bg:getComputedStyle(document.querySelector('#site-navigation-loading')).backgroundColor,
      spokes:document.querySelectorAll('.site-navigation-spinner rect').length};
  })()`);
  assert(Math.abs(bounds.x - bounds.w / 2) < 1);
  assert(Math.abs(bounds.y - bounds.h / 2) < 1);
  assert.equal(bounds.bg, "rgb(238, 238, 238)");
  assert.equal(bounds.spokes, 8);
  await screenshot("shineray-navigation-loading");
  await evaluate("window.requestAnimationFrame=window.__navigationFrame; window.__outgoingNavigation()");
  const activityRequest = await waitPaused("/api/activity");
  await waitFor("location.pathname==='/financement'");
  assert.equal(await evaluate(active), true, "Must wait for the real destination API");
  await call("Fetch.continueRequest", { requestId: activityRequest });
  await waitFor("!document.documentElement.classList.contains('site-navigation-pending')");
  assert.equal(await evaluate("document.body.inert"), false);
  await call("Fetch.disable");
  await evaluate("history.back()");
  await waitFor("location.pathname==='/compte' && document.readyState==='complete'");
  await waitFor("!document.documentElement.classList.contains('site-navigation-pending')");
  assert.equal(await evaluate("document.body.inert"), false);

  await intercept();
  await evaluate("document.querySelector('nav a[href=\"/projet\"]').click()");
  const productsRequest = await waitPaused("/api/products");
  await waitFor("location.pathname==='/projet'");
  assert.equal(await evaluate(active), false, "Navbar destination must not inherit a loader");
  await call("Fetch.continueRequest", { requestId: productsRequest });
  await call("Fetch.disable");

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 744, deviceScaleFactor: 1, mobile: true });
  await navigate("/compte");
  await intercept();
  await evaluate("document.querySelector('a[href=\"/financement\"]').click()");
  const failedRequest = await waitPaused("/api/activity");
  await waitFor("location.pathname==='/financement'");
  assert.equal(await evaluate(active), true);
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
  await screenshot("shineray-navigation-loading-small");
  await call("Fetch.fulfillRequest", {
    requestId: failedRequest, responseCode: 503,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify({ error: "Service temporairement indisponible." })).toString("base64"),
  });
  await waitFor("!document.documentElement.classList.contains('site-navigation-pending')");
  assert.equal(await evaluate("document.body.inert"), false);
  await call("Fetch.disable");
  console.log("PASS: loader centered at 472/390px; native document and actual API waits; navbar excluded on both pages; back restores interaction; API errors release loader.");
};

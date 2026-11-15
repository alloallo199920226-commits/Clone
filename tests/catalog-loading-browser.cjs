const assert = require("node:assert/strict");
const fs = require("node:fs");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, paused }) => {
  const html = fs.readFileSync("page_d_accueil_shineray/code.html", "utf8");
  assert(!/data-(?:price|daily|total|days)=/.test(html), "No static financial fallback");
  assert.equal((html.match(/data-purpose="buy-btn" disabled/g) || []).length, 6);
  const path = "/api/products/catalog";
  // Older Android browsers support fetch but not AbortSignal.timeout.
  const compatibility = await call("Page.addScriptToEvaluateOnNewDocument", {
    source: "Object.defineProperty(AbortSignal, 'timeout', {value: undefined, configurable: true});",
  });
  await call("Fetch.enable", { patterns: [{ urlPattern: "*api/products/catalog*", requestStage: "Request" }] });
  const ready = async () => {
    for (let i = 0; i < 100; i++) {
      if (paused.has(path)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Catalogue request missing");
  };
  const answer = async (status, body) => {
    await ready();
    const requestId = paused.get(path);
    paused.delete(path);
    await call("Fetch.fulfillRequest", {
      requestId, responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    });
  };
  const blank = async () => {
    assert(await evaluate(`Array.from(document.querySelectorAll(".metrics strong,.product-footer b"))
      .every(node => node.textContent === "—")`));
    assert(await evaluate(`Array.from(document.querySelectorAll('[data-purpose="buy-btn"]')).every(node => node.disabled)`));
    assert(await evaluate(`!document.querySelector(".product-card")?.dataset.price`));
  };
  const product = { code: "VIP1", name: "VIP1", price: 3500, dailyIncome: 1225,
    totalIncome: 79625, durationDays: 65, active: true };
  await navigate("/accueil");
  await waitFor(`Boolean(document.querySelector("[data-notification-close]"))`);
  await evaluate(`document.querySelector("[data-notification-close]").click()`);
  await ready();
  await blank();
  await screenshot("catalog-loading");
  await answer(503, { error: "Catalogue indisponible." });
  await waitFor(`document.querySelector(".catalog-status").textContent.includes("indisponible")`);
  await blank();
  await screenshot("catalog-error");

  await evaluate(`document.querySelector("[data-catalog-retry]").click()`);
  await answer(200, { products: [product] });
  await waitFor(`document.querySelector(".product-card").dataset.price === "3500"`);
  assert(await evaluate(`!document.querySelector('[data-purpose="buy-btn"]').disabled`));
  assert.equal(await evaluate(`document.querySelectorAll(".product-card").length`), 1,
    "Only the configured product must render; no static extra offers");
  await evaluate(`document.querySelector('[data-purpose="buy-btn"]').click()`);
  assert(await evaluate(`document.querySelector("[data-detail-price]").textContent.replace(/\\s/g, "").includes("3500")`));
  await evaluate(`document.querySelector(".cancel-purchase").click()`);
  await screenshot("catalog-current");

  // A restored tab must clear its old terms before refreshing.
  await evaluate(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
  await blank();
  await answer(200, { products: [{ ...product, price: 7000 }] });
  await waitFor(`document.querySelector(".product-card").dataset.price === "7000"`);
  // A broken later response must not retain previously loaded prices.
  await evaluate(`window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))`);
  await answer(200, { products: [{ ...product, dailyIncome: "invalid" }] });
  await waitFor(`document.querySelector(".catalog-status").textContent === ""`);
  await blank();
  await call("Fetch.disable");
  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: compatibility.identifier });
  console.log("PASS: no static prices, loading/error safe, current server terms and dialog, missing/invalid product unavailable, restored tab refresh.");
};

const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, paused, base }) => {
  const references = {
    settled: "PAY-72bfa23a-df1f-4d6b-a068-c1ce9ab338d9",
    pending: "55fcd2b4-e99c-4e45-b185-d6b0d176923c",
    failed: "PAY-eab09c83-0399-4a56-a94f-5f0cdb18b27f",
    legacy: "DEP-123",
  };
  paused.clear();
  await call("Fetch.enable", { patterns: [
    { urlPattern: "*/api/activity?kind=recharge", requestStage: "Request" },
    { urlPattern: "*/api/sonarapay/payments", requestStage: "Request" },
  ] });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await navigate("/historique-recharges");
  const activities = ["settled", "legacy", "missing"].map(id => ({
    id, reference: references[id] || null, amount_fcfa: 500, channel: "Orange Money",
    created_at: "2026-10-18T20:04:27Z", status: "succeeded",
  }));
  const payments = ["pending", "failed"].map(id => ({
    id, reference: references[id], amount_fcfa: 500, credited: false, status: id,
    operator: { operatorName: "Orange Money" }, created_at: "2026-10-18T20:04:27Z",
  }));
  for (const [path, payload] of [
    ["/api/activity", { activities, has_more: false }],
    ["/api/sonarapay/payments", { payments }],
  ]) {
    for (let i = 0; i < 100 && !paused.has(path); i++) await new Promise(r => setTimeout(r, 50));
    assert(paused.has(path), `Expected intercepted history request: ${path}`);
    await call("Fetch.fulfillRequest", {
      requestId: paused.get(path), responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
    });
  }
  await waitFor("document.querySelector('[data-activity-list]').getAttribute('aria-busy')==='false'");
  await call("Fetch.disable");
  assert.equal(await evaluate("document.querySelectorAll('.reference-activity-card').length"), 5);
  for (const [id, reference] of Object.entries(references)) {
    const selector = `[data-activity-id="${id}"]`;
    assert.equal(await evaluate(`document.querySelector('${selector}').textContent.includes(${JSON.stringify(reference)})`), false);
    assert.equal(await evaluate(`document.querySelector('${selector} .reference-short')`), null);
    assert.match(await evaluate(`document.querySelector('${selector} .payment-display-number').textContent`), /^\d{11}$/);
    assert.equal(await evaluate(`document.querySelector('${selector} .payment-display-number').textContent`),
      await evaluate(`window.paymentDisplayNumber(${JSON.stringify(reference)})`));
    if (["pending", "failed"].includes(id)) {
      assert.equal(await evaluate(`document.querySelector('${selector} a').getAttribute('href')`),
        "/confirmation-depot?payment=" + id);
    }
    assert.equal(await evaluate(`document.querySelector('${selector} .reference-status').dataset.status`),
      ["pending", "failed"].includes(id) ? id : "succeeded");
  }
  assert.equal(await evaluate("document.body.innerText.includes('Réf. commande')"), false);
  assert.equal(await evaluate("document.querySelector('.reference-copy-button')"), null);
  assert.equal(await evaluate("document.querySelector('[data-activity-id=\"missing\"] button')"), null);
  for (const width of [320, 390, 1360]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 500 });
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot("history-without-references");
  console.log("PASS: numeric display aliases, real references/copy controls absent; amounts and tracking unchanged; layouts at 320/390/1360px.");
};

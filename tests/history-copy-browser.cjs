const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, paused, base }) => {
  const references = {
    settled: "PAY-72bfa23a-df1f-4d6b-a068-c1ce9ab338d9",
    pending: "55fcd2b4-e99c-4e45-b185-d6b0d176923c",
    failed: "PAY-eab09c83-0399-4a56-a94f-5f0cdb18b27f",
    legacy: "DEP-123",
  };
  await call("Browser.grantPermissions", {
    origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
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
    const expected = reference.length > 18 ? reference.slice(0, 8) + "…" + reference.slice(-4) : reference;
    assert.equal(await evaluate(`document.querySelector('${selector} .reference-short').textContent`), expected);
    if (["pending", "failed"].includes(id)) {
      assert.equal(await evaluate(`document.querySelector('${selector} a').getAttribute('href')`),
        "/confirmation-depot?payment=" + id);
    }
    assert.equal(await evaluate(`document.querySelector('${selector} .reference-status').dataset.status`),
      ["pending", "failed"].includes(id) ? id : "succeeded");
  }
  assert.equal(await evaluate("document.querySelector('[data-activity-id=\"missing\"] .reference-short').textContent"), "—");
  assert.equal(await evaluate("document.querySelector('[data-activity-id=\"missing\"] button')"), null);
  for (const width of [320, 390, 1360]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 500 });
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.bringToFront");
  const point = await evaluate(`(() => {
    const r = document.querySelector('[data-activity-id="settled"] button').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await call("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
  }
  await waitFor("document.querySelector('[data-activity-id=\"settled\"] [role=\"status\"]').dataset.state==='success'");
  assert.equal(await evaluate("navigator.clipboard.readText()"), references.settled);
  await screenshot("history-short-reference");
  await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async () => { throw new Error('Denied'); } } });
    document.execCommand = () => false;
    document.querySelector('[data-activity-id="settled"] button').click();`);
  await waitFor("document.querySelector('[data-activity-id=\"settled\"] [role=\"status\"]').dataset.state==='error'");
  assert.equal(await evaluate("document.querySelectorAll('textarea').length"), 0);
  console.log("PASS: short/legacy/missing references, full clipboard value, explicit failure, payment links/statuses unchanged, layouts at 320/390/1360px.");
};

const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, paused }) => {
  const channels = [
    { id: "mtn_ci", operatorName: "MTN", provider: "sonarapay" },
    { id: "orange_ci", operatorName: "Orange Money", provider: "sonarapay" },
    { id: "moov_ci", operatorName: "Moov Money", provider: "sonarapay" },
    { id: 98765, operatorName: "Wave", provider: "manual",
      receiverName: "Marchand test", receiverNumber: "0700000000", ussdTemplate: "*123*{amount}#" },
  ];
  const pattern = "*/api/payment-channels/me";
  await call("Fetch.enable", { patterns: [{ urlPattern: pattern, requestStage: "Request" }] });
  async function configure() {
    await waitFor("document.querySelector('[data-deposit-content]').getAttribute('aria-busy') === 'true'");
    for (let i = 0; i < 100 && !paused.has("/api/payment-channels/me"); i++)
      await new Promise(resolve => setTimeout(resolve, 50));
    const requestId = paused.get("/api/payment-channels/me");
    assert(requestId);
    paused.delete("/api/payment-channels/me");
    await call("Fetch.fulfillRequest", { requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({
        countryCode: "+225", phoneLength: 10, provider: "mixed", channels,
      })).toString("base64"),
    });
    await waitFor("document.querySelector('[data-deposit-content]').getAttribute('aria-busy') === 'false'");
  }
  await evaluate(`sessionStorage.setItem("shineray-deposit-draft", JSON.stringify({
    amount_fcfa: 500, channel: 1, created_at: Date.now()
  }))`);
  await navigate("/choisir-operateur");
  await configure();
  assert.equal(await evaluate("document.querySelectorAll('[data-operator]').length"), 4);
  assert(await evaluate("document.querySelector('[data-submit-label]').textContent.includes('paiement')"));
  await evaluate(`document.querySelector('[data-operator="98765"]').click()`);
  assert.equal(await evaluate("document.querySelector('[data-submit-label]').textContent"), "Soumettre");
  assert(await evaluate("document.querySelector('[data-notice-body]').textContent.includes('administration')"));
  await evaluate(`document.querySelector('#deposit-phone').value='0700000000';
    document.querySelector('#deposit-operator-form').requestSubmit()`);
  await waitFor("location.pathname === '/confirmation-depot'");
  await configure();
  assert.equal(await evaluate("document.querySelector('[data-merchant-name]').textContent"), "Marchand test");
  assert.equal(await evaluate("document.querySelector('[data-ussd-code]').textContent"), "*123*500#");
  await screenshot("wave-manual-ci");
  await call("Fetch.disable");
  console.log("PASS: mixed CI selection, automatic labels, Wave manual instructions and USSD; no provider request.");
};

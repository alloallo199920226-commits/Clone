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
  await call("Fetch.enable", { patterns: [
    { urlPattern: pattern, requestStage: "Request" },
    { urlPattern: "*/api/manual-deposits", requestStage: "Request" },
  ] });
  async function configure() {
    await waitFor("document.querySelector('[data-deposit-content]')?.getAttribute('aria-busy') === 'true'");
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
  assert.equal(await evaluate("document.querySelector('.deposit-notice')"), null);
  await evaluate(`document.querySelector('#deposit-phone').value='0700000000';
    document.querySelector('#deposit-operator-form').requestSubmit()`);
  await waitFor("location.pathname === '/confirmation-depot'");
  await configure();
  assert.equal(await evaluate("document.querySelector('[data-merchant-name]').textContent"), "Marchand test");
  assert.equal(await evaluate("document.querySelector('[data-ussd-code]').textContent"), "*123*500#");
  await screenshot("wave-manual-ci");
  channels.find(channel => channel.provider === "manual").ussdTemplate = "";
  await navigate("/confirmation-depot");
  await configure();
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.signature-code-wrap')).display"), "none");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.deposit-ussd-actions')).display"), "none");
  assert(await evaluate("document.querySelector('[data-manual-transfer]').innerText.includes('copier le numéro de réception')"));
  assert.equal(await evaluate("document.querySelector('[data-manual-transfer]').innerText"),
    "Veuillez copier le numéro de réception, aller dans votre répertoire téléphonique ou dans votre application Mobile Money, effectuer le paiement dessus, puis revenez cliquer sur « Obtenir le résultat ». Votre compte est crédité en moins de 5 mn.");
  for (const width of [900, 390]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height: 844, deviceScaleFactor: 1, mobile: width === 390,
    });
    assert(await evaluate(`(() => {
      const paragraph = document.querySelector('[data-manual-transfer]');
      const text = getComputedStyle(paragraph);
      const card = getComputedStyle(paragraph.closest('.deposit-ussd-card'));
      return parseFloat(text.fontSize) >= 16 && parseInt(text.fontWeight, 10) >= 600
        && parseFloat(text.lineHeight) >= 24 && parseFloat(card.borderLeftWidth) >= 4
        && document.documentElement.scrollWidth <= innerWidth + 1;
    })()`), "Manual instructions must stand out and fit both desktop and mobile.");
  }
  await evaluate("document.querySelector('[data-manual-transfer]').closest('.deposit-ussd-card').scrollIntoView({block:'center'})");
  await screenshot("manual-transfer-without-ussd");
  await evaluate(`window.manualTestRequests=[];
    const originalFetch=window.fetch;
    window.fetch=(url,options)=>{
      if(url==='/api/manual-deposits') window.manualTestRequests.push(JSON.parse(options.body));
      return originalFetch(url,options);
    };
    document.querySelector('[data-deposit-result]').click();
    document.querySelector('[data-deposit-result]').click();`);
  async function respond(code, payload) {
    for (let i = 0; i < 100 && !paused.has("/api/manual-deposits"); i++)
      await new Promise(resolve => setTimeout(resolve, 50));
    const requestId = paused.get("/api/manual-deposits");
    assert(requestId, "Manual deposit submission must reach the server");
    paused.delete("/api/manual-deposits");
    await call("Fetch.fulfillRequest", { requestId, responseCode: code,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(payload)).toString("base64") });
  }
  await respond(503, { error: "Enregistrement non confirmé. Réessayez sans refaire le transfert." });
  await waitFor("!document.querySelector('[data-deposit-result]').disabled");
  assert.equal(await evaluate("location.pathname"), "/confirmation-depot");
  await evaluate("document.querySelector('[data-deposit-result]').click()");
  await respond(201, { deposit: { reference: "MAN-browser-fixture", status: "pending" } });
  await waitFor("document.querySelector('[data-deposit-status]').textContent.includes('10 s')");
  assert.match(await evaluate("document.querySelector('[data-manual-display-number]').textContent"), /^\d{11}$/);
  assert.equal(await evaluate("document.querySelector('[data-manual-display-row]').hidden"), false);
  assert.equal(await evaluate("window.manualTestRequests.length"), 2, "Double click must not resubmit");
  assert.equal(await evaluate("window.manualTestRequests[0].request_id"),
    await evaluate("window.manualTestRequests[1].request_id"), "Retry must retain its idempotency key");
  assert(await evaluate("document.querySelector('[data-deposit-validation]').textContent.includes('attente')"));
  assert.equal(await evaluate("document.querySelector('[data-deposit-result]').getAttribute('aria-busy')"), "true");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-deposit-result]'),'::before').animationName"), "manual-deposit-spin");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-deposit-result]'),'::before').content"), '""');
  await screenshot("manual-deposit-recorded");
  await new Promise(resolve => setTimeout(resolve, 10500));
  await waitFor("location.pathname === '/accueil'");
  assert.equal(await evaluate("sessionStorage.getItem('shineray-deposit-draft')"), null);
  await call("Fetch.disable");
  console.log("PASS: mixed CI, Wave manual instructions, POST declaration, double-click protection, safe retry, spinner and 10s home redirect; no provider request.");
};

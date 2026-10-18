const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, base }) => {
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await call("Browser.grantPermissions", {
    origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await navigate("/compte");
  await waitFor("document.querySelector('[data-copy-phone]').disabled === false");
  await call("Page.bringToFront");
  const position = await evaluate(`(() => {
    const phone = document.querySelector('[data-user-phone]').getBoundingClientRect();
    const button = document.querySelector('[data-copy-phone]').getBoundingClientRect();
    return { x: button.x + button.width / 2, y: button.y + button.height / 2,
      afterPhone: button.left >= phone.right && button.left - phone.right < 12,
      aligned: Math.abs((button.y + button.height / 2) - (phone.y + phone.height / 2)) < 2 };
  })()`);
  assert(position.afterPhone && position.aligned, "Copy icon must sit beside the number");
  for (const type of ["mousePressed", "mouseReleased"]) {
    await call("Input.dispatchMouseEvent", { type, x: position.x, y: position.y, button: "left", clickCount: 1 });
  }
  await waitFor("document.querySelector('[data-phone-copy-status]').textContent === 'Numéro copié !'");
  assert.equal(await evaluate("navigator.clipboard.readText()"),
    await evaluate("fetch('/api/me').then(r => r.json()).then(user => user.phone)"));
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
  await screenshot("account-phone-copy");
  await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async () => { throw new Error('Denied'); } } });
    document.execCommand = () => false;
    document.querySelector('[data-copy-phone]').click();`);
  await waitFor("document.querySelector('[data-phone-copy-status]').textContent.startsWith('Copie impossible')");
  assert.equal(await evaluate("document.querySelector('[data-copy-phone]').disabled"), false);
  assert.equal(await evaluate("document.querySelectorAll('textarea').length"), 0);
  console.log("PASS: icon beside phone; full international number copied; visible success and explicit failure; mobile layout intact.");
};

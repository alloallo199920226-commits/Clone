const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, base }) => {
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await call("Browser.grantPermissions", {
    origin: base, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await navigate("/equipe");
  await waitFor("document.querySelector('[data-team-page]').getAttribute('aria-busy')==='false'");
  await call("Page.bringToFront");
  async function clickCopy(kind) {
    const { x, y } = await evaluate(`(() => {
      const r = document.querySelector('[data-copy-value="${kind}"]').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  for (const kind of ["code", "link"]) {
    await clickCopy(kind);
    await waitFor(`document.querySelector('[data-copy-value="${kind}"]').dataset.copied==='true'`);
    const copied = await evaluate("navigator.clipboard.readText()");
    assert.equal(copied, await evaluate(`document.querySelector('[data-referral-${kind}]').textContent`));
    assert.equal(await evaluate(`(() => {
      const message = document.querySelector('[data-team-status]');
      const rect = message.getBoundingClientRect();
      return message.dataset.state === 'success' && rect.top >= 0 &&
        rect.bottom < innerHeight - 63 && message.closest('.team-invite') !== null;
    })()`), true);
  }
  await screenshot("team-copy-success");
  // Verify the Safari fallback receives the complete value, and errors never claim success.
  await evaluate(`window.copyFallbackValue = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true,
      value: { writeText: async () => { throw new Error('Permission denied'); } } });
    document.execCommand = command => {
      window.copyFallbackValue = document.activeElement.value;
      return command === 'copy';
    };
    document.querySelector('[data-copy-value="link"]').click();`);
  await waitFor("window.copyFallbackValue !== ''");
  assert.equal(await evaluate("window.copyFallbackValue"), await evaluate("document.querySelector('[data-referral-link]').textContent"));
  await waitFor("!document.querySelector('[data-copy-value=\"link\"]').disabled");
  await evaluate(`document.execCommand = () => false;
    document.querySelector('[data-copy-value="code"]').click();`);
  await waitFor("document.querySelector('[data-team-status]').dataset.state==='error'");
  assert.equal(await evaluate("document.querySelector('[data-copy-value=\"code\"]').textContent"), "Copier le code");
  assert.equal(await evaluate("document.querySelectorAll('textarea').length"), 0);
  assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false);
  console.log("PASS: code/link really copied, confirmation visible on mobile, fallback and explicit copy errors verified.");
};

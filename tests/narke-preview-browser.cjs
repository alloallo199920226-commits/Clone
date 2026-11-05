const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, screenshot }) => {
  const names = ["Withdraw", "Support", "Deposits", "Account", "Missions", "Team", "TeamDetail"];
  for (const width of [390, 472, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 920, deviceScaleFactor: 1, mobile: width < 600 });
    for (const name of names) {
      const path = `/__mockup/preview/narke-suite/${name}`;
      await call("Page.navigate", { url: `http://127.0.0.1:23636${path}` });
      await waitFor(`location.pathname===${JSON.stringify(path)} && !!document.querySelector('.narke-preview')`);
      await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
      assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `${name}: preview overflow at ${width}`);
      const count = await evaluate("document.querySelectorAll('.np-bottom').length");
      assert.equal(count, ["Deposits", "Account", "Team"].includes(name) ? 1 : 0, `${name}: duplicate/missing navigation`);
      if (width === 472) await screenshot(`narke-preview-${name}`);
    }
  }
  await call("Page.navigate", { url: "http://127.0.0.1:23636/__mockup/preview/narke-suite/Team" });
  await waitFor("!!document.querySelector('.np-header button')");
  await evaluate("document.querySelector('.np-header button').click()");
  await waitFor("document.querySelector('.np-header button').getAttribute('aria-expanded')==='true'");
  assert(await evaluate("!!document.querySelector('.np-menu')"));
  await evaluate("document.querySelector('.np-header button').click()");
  assert.equal(await evaluate("document.querySelector('.np-header button').getAttribute('aria-expanded')"), "false");
  console.log("PASS: Seven isolated NARKE previews at three widths, all image resources, single navigation and local menu state.");
};

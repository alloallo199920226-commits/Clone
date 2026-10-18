const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, navigate, publicOnly }) => {
  const routes = publicOnly
    ? ["/inscription", "/connexion", "/omarshark-junior-panam"]
    : ["/recharger", "/retrait", "/ajouter-compte-retrait", "/choisir-operateur"];
  let count = 0;
  for (const width of [390, 768, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height: 844, deviceScaleFactor: 1, mobile: width === 390,
    });
    for (const route of routes) {
      await navigate(route);
      const result = await evaluate(`(() => {
        const selector = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),select,textarea';
        const fields = [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length);
        const measurements = fields.map(el => {
          el.focus();
          const style = getComputedStyle(el);
          const wrapper = el.closest('.phone-field,.deposit-phone-wrap,.input-wrap,.field-inline');
          const wrappedStyle = wrapper && getComputedStyle(wrapper);
          return {fontSize: parseFloat(style.fontSize), border: style.borderTopWidth,
            outline: style.outlineStyle, shadow: style.boxShadow,
            wrapperOutline: wrappedStyle?.outlineStyle, wrapperShadow: wrappedStyle?.boxShadow};
        });
        return {measurements, viewport:document.querySelector('meta[name=viewport]')?.content,
          stylesheet:!!document.querySelector('link[href="/pages/form-controls.css?v=1"]'),
          overflow: document.documentElement.scrollWidth > innerWidth + 1};
      })()`);
      assert(result.stylesheet, route);
      assert(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:,|$)/i.test(result.viewport), route);
      assert.equal(result.overflow, false, `${route} at ${width}px`);
      for (const field of result.measurements) {
        assert(field.fontSize >= 16, JSON.stringify({ route, width, field }));
        assert.equal(field.border, "0px", route);
        assert.equal(field.outline, "none", route);
        assert.equal(field.shadow, "none", route);
        if (field.wrapperOutline) assert.equal(field.wrapperOutline, "none", route);
        if (field.wrapperShadow) assert.equal(field.wrapperShadow, "none", route);
        count++;
      }
    }
  }
  console.log(`PASS: ${count} focused field checks (${publicOnly ? "public/admin" : "customer"}), 390/768/1280px; manual zoom remains enabled.`);
};

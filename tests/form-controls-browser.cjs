const assert = require("node:assert/strict");
const luminance = color => {
  const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
};

module.exports = async ({ call, evaluate, navigate, screenshot, publicOnly }) => {
  const routes = publicOnly
    ? ["/inscription", "/connexion", "/omarshark-junior-panam"]
    : ["/recharger", "/retrait", "/ajouter-compte-retrait", "/choisir-operateur", "/compte"];
  let count = 0;
  for (const width of [390, 768, 1280]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width, height: 844, deviceScaleFactor: 1, mobile: width === 390,
    });
    for (const route of routes) {
      let injected;
      if (route === "/choisir-operateur") {
        injected = await call("Page.addScriptToEvaluateOnNewDocument", {source: `
          sessionStorage.setItem('shineray-deposit-draft',JSON.stringify({
            amount_fcfa:2500,channel:1,created_at:Date.now()
          }));
          const originalFetch=window.fetch.bind(window);
          window.fetch=(url,options)=>url==='/api/payment-channels/me'
            ? Promise.resolve(new Response(JSON.stringify({
                countryCode:'+229',phoneLength:10,provider:'mixed',
                channels:[{id:123,operatorName:'MTN',provider:'manual'}]
              }),{status:200,headers:{'Content-Type':'application/json'}}))
            : originalFetch(url,options);
        `});
      }
      await navigate(route);
      if (injected) await call("Page.removeScriptToEvaluateOnNewDocument", {identifier:injected.identifier});
      const result = await evaluate(`(() => {
        const selector = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]),select,textarea';
        const fields = [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length);
        const measurements = fields.map(el => {
          if (el.tagName === 'INPUT') {
            el.value = el.type === 'number' || el.type === 'tel' ? '5000' : 'Texte lisible';
          }
          el.focus();
          const style = getComputedStyle(el);
          const wrapper = el.closest('.phone-field,.deposit-phone-wrap,.input-wrap,.field-inline');
          const wrappedStyle = wrapper && getComputedStyle(wrapper);
          return {color:style.color, fill:style.webkitTextFillColor, background:style.backgroundColor,
            placeholder:getComputedStyle(el,'::placeholder').color,
            fontSize: parseFloat(style.fontSize), border: style.borderTopWidth,
            outline: style.outlineStyle, shadow: style.boxShadow,
            wrapperOutline: wrappedStyle?.outlineStyle, wrapperShadow: wrappedStyle?.boxShadow};
        });
        return {measurements, viewport:document.querySelector('meta[name=viewport]')?.content,
          stylesheet:!!document.querySelector('link[href="/pages/form-controls.css?v=3"]'),
          overflow: document.documentElement.scrollWidth > innerWidth + 1};
      })()`);
      assert(result.stylesheet, route);
      if (route === "/choisir-operateur") assert(result.measurements.length > 0, "Payment phone field must actually be rendered");
      assert(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:,|$)/i.test(result.viewport), route);
      assert.equal(result.overflow, false, `${route} at ${width}px`);
      for (const field of result.measurements) {
        if (route === "/choisir-operateur") {
          assert.equal(field.fill, "rgb(13, 38, 57)", "Payment text must stay dark");
          assert.equal(field.background, "rgb(241, 247, 246)", "Payment surface must stay light");
        }
        const foreground = luminance(field.fill || field.color), background = luminance(field.background);
        const contrast = (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        assert(contrast >= 4.5, `${route}: focused text contrast ${contrast.toFixed(2)} must meet 4.5:1`);
        assert(field.fontSize >= 16, JSON.stringify({ route, width, field }));
        assert.equal(field.border, "0px", route);
        assert.equal(field.outline, "none", route);
        assert.equal(field.shadow, "none", route);
        if (field.wrapperOutline) assert.equal(field.wrapperOutline, "none", route);
        if (field.wrapperShadow) assert.equal(field.wrapperShadow, "none", route);
        count++;
      }
      if (route === "/retrait" && width === 390 && screenshot) {
        await screenshot("narke-withdraw-focused-readable");
      }
      if (route === "/choisir-operateur" && width === 390 && screenshot) {
        await screenshot("narke-payment-phone-readable");
      }
    }
  }
  console.log(`PASS: ${count} focused field checks (${publicOnly ? "public/admin" : "customer"}), 390/768/1280px; manual zoom remains enabled.`);
};

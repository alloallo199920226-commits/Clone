const assert = require("node:assert/strict");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot }) => {
  for (const path of ["/a-propos", "/regles"]) {
    await navigate("/compte");
    await evaluate(`document.querySelector('a[href="${path}"]').click()`);
    await waitFor(`location.pathname === '${path}' && !!document.querySelector('.narke-info-page')`);
    await waitFor("document.querySelector('.info-hero img').complete && document.querySelector('.info-hero img').naturalWidth>0");
    await waitFor("!document.querySelector('[data-navigation-loader]') || document.querySelector('[data-navigation-loader]').hidden");
    assert(!await evaluate("/IVECO|camion|Valhalla/i.test(document.title+' '+document.body.innerText)"));
    for (const [width,height] of [[320,568],[390,844],[768,1024],[1280,900]]) {
      await call("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:true });
      assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `Overflow ${path} ${width}`);
      for (let i=0; i<await evaluate("document.images.length"); i++) {
        await evaluate(`document.images[${i}].scrollIntoView({block:'center'})`);
        await waitFor(`document.images[${i}].complete && document.images[${i}].naturalWidth>0`);
      }
    }
    await call("Emulation.setDeviceMetricsOverride", { width:390,height:844,deviceScaleFactor:1,mobile:true });
    await evaluate("scrollTo(0,0)");
    await screenshot(path==="/regles" ? "narke-rules-top" : "narke-about-top");
    await evaluate("document.querySelector('.info-jumpbar a').click()");
    assert(await evaluate("location.hash.length>1"), "Section anchor works");
    const text=await evaluate("document.body.innerText");
    if(path==="/regles") {
      assert.equal(await evaluate("document.querySelector('#investissements, a[href=\"#investissements\"],script[src=\"/pages/narke-investments.js\"]')"),null);
      assert.match(text,/24 heures/);
      assert.match(text,/18h00/);
      assert.match(text,/20\s*%/);
      assert.match(text,/3[\u00a0 ]500/);
      assert.match(text,/2[\u00a0 ]300/);
      assert.match(text,/premier dépôt/);
    }
    assert.equal(await evaluate("document.querySelector('.info-cta').getAttribute('href')"),"/service-client");
    await evaluate("document.querySelector('.info-back').click()");
    await waitFor("location.pathname==='/compte'");
  }
  console.log("PASS: NARKE about/rules, true account-link navigation and back, current terms, image loading, anchors, support and four responsive widths.");
};

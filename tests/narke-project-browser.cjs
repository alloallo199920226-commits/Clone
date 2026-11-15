/* Development browser fixtures: isolated throwaway account, cleaned by harness. */
const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const fs = require("node:fs");

module.exports = async ({call,evaluate,waitFor,navigate,screenshot,base,userId}) => {
  await navigate("/projet");
  await waitFor("document.querySelector('[data-products-list]')?.getAttribute('aria-busy')==='false'");
  assert(await evaluate("document.querySelector('[data-products-empty]').hidden===false"));
  assert.equal(await evaluate("document.querySelector('[data-purchase-count]').textContent"),"0");
  await screenshot("narke-project-empty");

  // Frozen contracts belong to this fixture only. No real purchases or payouts.
  execFileSync("python3", ["-c", `
import auth_backend
from psycopg.types.json import Jsonb
with auth_backend.connect() as con,con.cursor() as cur:
 for vip,price,daily in [(1,4000,1000),(2,8000,2000)]:
  cur.execute("""INSERT INTO shineray_transactions
   (user_id,kind,label,amount_fcfa,provider_reference,details)
   VALUES (%s,'purchase',%s,%s,%s,%s)""",
   (${Number(userId)},f'VIP{vip}',-price,f'narke-project-test:${Number(userId)}:{vip}',
    Jsonb({'vip':vip,'quantity':1,'daily_income_fcfa':daily,
     'total_income_fcfa':daily*180,'validity_days':180,'income_fcfa':0})))
`], {encoding:"utf8"});
  const api = await evaluate("fetch('/api/products').then(r=>r.json())");
  assert.equal(api.quantity,2);
  assert.equal(api.income_fcfa,0);

  for (const width of [320,390,472,768,1280]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:920,deviceScaleFactor:1,mobile:width<700});
    await navigate("/projet");
    await waitFor("document.querySelector('[data-products-list]')?.getAttribute('aria-busy')==='false' && document.querySelectorAll('.owned-product').length===2");
    await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
    await waitFor("document.getAnimations().every(a=>a.effect.getComputedTiming().iterations===Infinity||a.playState==='finished')");
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),`Project overflows at ${width}`);
    assert(await evaluate(`(()=>{
      return [...document.querySelectorAll('.owned-product')].every(card=>{
        const r=card.getBoundingClientRect();
        return r.height>=160 && r.height<=330 &&
          [...card.querySelectorAll('.owned-product-row')].length===6 &&
          [...card.querySelectorAll('.owned-product-row')].every(row=>{
            const rr=row.getBoundingClientRect();
            return rr.height>0 && rr.top>=r.top && rr.bottom<=r.bottom+1;
          });
      });
    })()`),`VIP cards must remain compact with six visible rows at ${width}`);
    assert(await evaluate("[...document.querySelectorAll('.owned-product-row-label,.owned-stat-label')].every(e=>e.scrollWidth<=e.clientWidth+1)"),`A label is truncated at ${width}`);
    assert.equal(await evaluate("document.querySelector('[data-purchase-count]').textContent"),String(api.quantity));
    assert.equal(await evaluate("Number(document.querySelector('[data-purchase-total]').textContent.replace(/\\D/g,''))"),api.income_fcfa);
    assert(await evaluate("!!document.querySelector('.narke-project-page')"));
    assert(await evaluate("!document.querySelector('img[src*=\"iveco\"]')"),"Old vehicle artwork remains");
    for (const product of api.products) {
      const rendered = await evaluate(`document.querySelector('[data-product-id="${product.id}"]').textContent`);
      assert(rendered.includes(product.name));
      for (const amount of [product.amount_fcfa,product.daily_income_fcfa,product.total_income_fcfa]) {
        assert(rendered.includes(new Intl.NumberFormat("en-US").format(amount)),`Missing real contract amount ${amount}`);
      }
      assert(rendered.includes("180"));
      if (product.next_income_at) {
        assert(!rendered.includes("Configuration en attente"), "A real income schedule must be displayed");
      } else {
        assert(rendered.includes(product.automatic_income_enabled ? "Cycle terminé" : "Configuration en attente"),
          "Missing schedule must not become a fake next payout");
      }
    }
    for (const route of ["/accueil","/projet","/equipe","/compte"]) {
      assert(await evaluate(`!!document.querySelector('.owned-bottom-nav a[href="${route}"]')`));
    }
    if (width===472||width===1280) {
      await screenshot(`narke-project-${width}`);
      if (width===472) {
        const metrics=await call("Page.getLayoutMetrics");
        const result=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,
          clip:{x:0,y:0,width,height:Math.ceil(metrics.cssContentSize.height),scale:1}});
        fs.writeFileSync("/tmp/narke-project-full.png",Buffer.from(result.data,"base64"));
      }
    }
  }
  await call("Emulation.setDeviceMetricsOverride",{width:472,height:920,deviceScaleFactor:1,mobile:true});
  await call("Network.setBlockedURLs",{urls:[`${base}/api/products`]});
  await navigate("/projet");
  await waitFor("document.querySelector('[data-products-error]')?.hidden===false");
  assert.equal(await evaluate("document.querySelectorAll('.owned-product').length"),0);
  assert.equal(await evaluate("document.querySelector('[data-purchase-total]').textContent"),"—");
  await screenshot("narke-project-error");
  await call("Network.setBlockedURLs",{urls:[]});
  await evaluate("document.querySelector('.project-retry').click()");
  await waitFor("document.querySelectorAll('.owned-product').length===2");
  await evaluate("document.querySelector('.owned-product-summary').click()");
  assert.equal(await evaluate("document.querySelector('.owned-product-details').open"),false);
  assert(await evaluate("document.querySelector('.owned-product').getBoundingClientRect().height<160"));
  assert.equal(await evaluate("document.querySelector('.owned-product-row').getBoundingClientRect().height"),0);
  await evaluate("document.querySelector('.owned-product-summary').click()");
  assert.equal(await evaluate("document.querySelector('.owned-product-details').open"),true);
  await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  assert(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"));
  console.log("PASS: NARKE project at five widths, real frozen contracts and income, loaded images, empty/error/recovery states, navigation and reduced motion.");
};

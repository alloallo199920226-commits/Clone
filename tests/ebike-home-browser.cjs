const assert = require("node:assert/strict");
const { randomInt } = require("node:crypto");

module.exports = async ({ call, evaluate, waitFor, navigate, screenshot, trackUser }) => {
  const phone = "9" + String(randomInt(1e7)).padStart(7, "0");
  const registered = await evaluate(`fetch('/api/auth/register', {
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({country_code:'+228',phone:${JSON.stringify(phone)},
      password:'ebike-home-test-password',referral_code:''})
  }).then(async r=>({status:r.status,body:await r.json()}))`);
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  trackUser(registered.body.user.id);
  const closeNotice = async () => {
    await waitFor("document.querySelector('.platform-notification-dialog[open]') || document.querySelector('main > [role=status]')");
    await evaluate("document.querySelector('[data-notification-close]')?.click()");
  };
  await navigate("/accueil");
  await closeNotice();
  await waitFor("document.querySelector('.catalog-status').textContent!=='Chargement du catalogue…' && document.querySelector('.hero-scene').naturalWidth>0");
  const products = await evaluate("fetch('/api/products/catalog').then(r=>r.json()).then(r=>r.products)");
  assert.equal(await evaluate("document.querySelectorAll('.product-card').length"), products.length);
  for (const product of products) {
    const terms = await evaluate(`(() => {
      const c=[...document.querySelectorAll('.product-card')].find(c=>c.dataset.vip===${JSON.stringify(product.code)});
      return {price:Number(c.dataset.price),daily:Number(c.dataset.daily),total:Number(c.dataset.total),hidden:c.hidden};
    })()`);
    assert.deepEqual(terms, { price: product.price, daily: product.dailyIncome, total: product.totalIncome, hidden: false });
    const match = /^VIP\s*(\d+)$/i.exec(product.name);
    const models = ["City","Urban","Trek","Sport","Explorer","Signature"];
    const name = match ? `E-Bike Pro ${models[Number(match[1])-1] || `Série ${Number(match[1])}`}` : product.name;
    assert.equal(await evaluate(`document.querySelector('.product-card[data-vip="${product.code}"] h3').textContent`), name);
    assert(await evaluate(`document.querySelector('.product-card[data-vip="${product.code}"] .product-category').textContent.includes(${JSON.stringify(String(product.durationDays))})`));
  }
  if(!products.length) {
    assert(await evaluate("document.querySelector('.catalog-status').textContent.includes('Aucun produit')"));
    assert.equal(await evaluate("document.querySelectorAll('.product-card').length"),0);
  }
  for (const [width, height] of [[390,844],[320,740],[1280,900]]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor:1, mobile:width<800 });
    assert(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `Overflow at ${width}`);
    assert(await evaluate(`(() => {
      const logo=document.querySelector('.shineray-logo').getBoundingClientRect();
      const actions=document.querySelector('.header-actions').getBoundingClientRect();
      return logo.right <= actions.left && actions.right <= innerWidth;
    })()`), `Header overlap at ${width}`);
    assert(await evaluate(`(() => {
      const cta=document.querySelector('.hero-cta').getBoundingClientRect();
      const quick=document.querySelector('.quick-actions').getBoundingClientRect();
      return cta.bottom <= quick.top;
    })()`), `Hero action covered at ${width}`);
    await evaluate("scrollTo(0,0)");
    await screenshot(`ebike-home-${width}`);
  }
  await call("Emulation.setDeviceMetricsOverride", { width:390,height:844,deviceScaleFactor:1,mobile:true });
  if(products.some(p=>p.active && p.purchasable!==false)) {
  await evaluate("document.querySelector('[data-favorite]').click()");
  assert.equal(await evaluate("document.querySelector('[data-favorite]').getAttribute('aria-pressed')"), "true");
  await navigate("/accueil");
  await closeNotice();
  await waitFor("document.querySelector('.product-card[data-available=true]')");
  assert.equal(await evaluate("document.querySelector('[data-favorite]').getAttribute('aria-pressed')"), "true");
  await evaluate("document.querySelector('.hero-cta').click()");
  await waitFor("location.hash === '#catalog'");
  await evaluate("document.querySelector('[data-notification-open]').click()");
  await waitFor("document.querySelector('.platform-notification-dialog').open");
  await evaluate("document.querySelector('[data-notification-close]').click()");
  const before = await evaluate("fetch('/api/me').then(r=>r.json()).then(r=>r.balance_fcfa)");
  await evaluate(`(() => {
    const c=document.querySelector('.product-card[data-available=true]');
    c.dataset.price=String(Number(c.dataset.price)+1);
    c.querySelector('[data-purpose=buy-btn]').click();
  })()`);
  assert.equal(await evaluate("document.querySelector('.purchase-dialog').open"), true);
  await screenshot("ebike-home-purchase");
  await evaluate("document.querySelector('.confirm-purchase').click()");
  await waitFor("document.querySelector('.purchase-error').textContent.includes('prix a changé')");
  assert.equal(await evaluate("fetch('/api/me').then(r=>r.json()).then(r=>r.balance_fcfa)"), before);
  await evaluate("document.querySelector('.cancel-purchase').click()");
  }

  const fakeProducts = Array.from({length:8}, (_,i) => ({
    code:i<6?`VIP${i+1}`:`EXTRA${i+1}`,
    name:i<6?`VIP${i+1}`:i===6?"NARKE Atelier – nom administrateur":`Modèle test ${i+1}`,price:2000+i,
    dailyIncome:100,totalIncome:3000,durationDays:30,active:true,purchasable:i===0,
  }));
  const intercept = await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__catalogMode='many';
    const originalFetch=window.fetch.bind(window);
    window.fetch=(url,options)=>{
      if(new URL(typeof url==='string'?url:url.url,location.href).pathname==='/api/products/catalog') {
        const mode=window.__catalogMode;
        return Promise.resolve(new Response(JSON.stringify(mode==='error'?{error:'test'}:
          {products:mode==='empty'?[]:${JSON.stringify(fakeProducts)}}),
          {status:mode==='error'?503:200,headers:{'Content-Type':'application/json'}}));
      }
      return originalFetch(url,options);
    };
  ` });
  try {
    await navigate("/accueil");
    await closeNotice();
    await waitFor("document.querySelectorAll('.product-card').length===8");
    const models = ["City","Urban","Trek","Sport","Explorer","Signature"];
    for(const [index,product] of fakeProducts.entries()) {
      const name = index<6?`E-Bike Pro ${models[index]}`:product.name;
      assert.equal(await evaluate(`document.querySelector('.product-card[data-vip="${product.code}"] h3').textContent`),name);
      assert.equal(await evaluate(`document.querySelector('.product-card[data-vip="${product.code}"]').dataset.name`),product.name);
      assert.equal(await evaluate(`document.querySelector('.product-card[data-vip="${product.code}"] .product-badge').textContent`),product.code);
    }
    await evaluate(`(() => {
      const heading=document.createElement('h2');
      heading.id='owned-name-regression';
      heading.className='owned-product-title';
      heading.hidden=true;
      heading.textContent='VIP3';
      document.body.append(heading);
    })()`);
    await waitFor("document.querySelector('#owned-name-regression').textContent==='E-Bike Pro Trek'");
    await evaluate("document.querySelector('#owned-name-regression').remove()");
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"),"Configured product names must fit mobile cards");
    assert.equal(await evaluate("document.querySelectorAll('.product-card[data-available=true]').length"),1);
    await evaluate("document.querySelector('[data-purpose=buy-btn]').click()");
    await waitFor("document.querySelector('#dialog-title').textContent==='E-Bike Pro City'");
    assert(await evaluate("document.querySelector('[data-purpose=buy-btn]').getAttribute('aria-label').includes('E-Bike Pro City')"));
    await screenshot("ebike-admin-configured-products");
    await evaluate("document.querySelector('.cancel-purchase').click()");
    await screenshot("ebike-product-model-names");
    await evaluate("window.__catalogMode='empty'; document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor("document.querySelector('.catalog-status').textContent.includes('Aucun produit')");
    assert.equal(await evaluate("document.querySelectorAll('.product-card').length"), 0);
    await evaluate("window.__catalogMode='error'; document.dispatchEvent(new Event('visibilitychange'))");
    await waitFor("!document.querySelector('[data-catalog-retry]').hidden");
    assert.equal(await evaluate("document.querySelectorAll('[data-purpose=buy-btn]:not(:disabled)').length"), 0);
    await evaluate("window.__catalogMode='many'; document.querySelector('[data-catalog-retry]').click()");
    await waitFor("document.querySelectorAll('.product-card').length===8");
  } finally {
    await call("Page.removeScriptToEvaluateOnNewDocument", {identifier:intercept.identifier});
  }
  console.log("PASS: six E-Bike model names, matching purchase title and accessible labels, preserved administrator data and custom names, responsive catalog, empty/error/retry states.");
};

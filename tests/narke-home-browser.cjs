const assert = require("node:assert/strict");

module.exports = async ({call,evaluate,waitFor,navigate,screenshot}) => {
  async function openHome() {
    await navigate("/accueil");
    await waitFor("document.querySelector('.catalog-status').textContent==='' && document.querySelector('.product-card').dataset.price");
    await waitFor("document.querySelector('.platform-notification-dialog')?.open");
    await evaluate("document.querySelector('[data-notification-close]').click()");
    await waitFor("!document.querySelector('.platform-notification-dialog').open");
  }
  await openHome();
  const catalog = await evaluate("fetch('/api/products/catalog',{cache:'no-store'}).then(r=>r.json()).then(r=>r.products)");
  const cards = await evaluate(`[...document.querySelectorAll('.product-card')].map(card=>({
    code:card.dataset.vip,price:Number(card.dataset.price),daily:Number(card.dataset.daily),
    total:Number(card.dataset.total),days:Number(card.dataset.days),
    title:card.querySelector('h2,h3').textContent,model:card.dataset.model,
    available:card.dataset.available,disabled:card.querySelector('[data-purpose=buy-btn]').disabled
  }))`);
  assert.equal(cards.length,6,"All six existing offers must remain accessible");
  for (const card of cards) {
    const product=catalog.find(product=>product.code===card.code);
    assert(product,card.code);
    assert.equal(card.price,product.price);
    assert.equal(card.daily,product.dailyIncome);
    assert.equal(card.total,product.totalIncome);
    assert.equal(card.days,product.durationDays);
    assert.equal(card.title,card.model || product.name);
    assert.equal(card.disabled,product.active!==true);
  }
  for (const width of [320,390,393,402,430,472,1280]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:868,deviceScaleFactor:1,mobile:width<800});
    await evaluate("scrollTo(0,0)");
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"),`Overflow at ${width}`);
    const geometry=await evaluate(`(()=>{
      const cards=[...document.querySelectorAll('.product-card')].filter(card=>!card.hidden);
      const boxes=cards.map(card=>card.getBoundingClientRect());
      return {widths:boxes.map(box=>box.width),heights:boxes.map(box=>box.height),
        nav:document.querySelector('.bottom-navigation').getBoundingClientRect().bottom,
        viewport:innerHeight,
        broken:[...document.querySelectorAll('.product-card img,.home-header img,.hero-slide')].some(img=>img instanceof HTMLImageElement && (!img.complete || !img.naturalWidth))};
    })()`);
    assert.equal(geometry.broken,false,`Broken image at ${width}`);
    assert(Math.max(...geometry.widths)-Math.min(...geometry.widths)<2,`Unequal widths at ${width}`);
    assert(Math.max(...geometry.heights)-Math.min(...geometry.heights)<2,`Unequal heights at ${width}`);
    assert(Math.abs(geometry.nav-geometry.viewport)<=1,`Bottom nav at ${width}`);
    if ([390,472,1280].includes(width)) await screenshot(`narke-home-${width}`);
  }
  await call("Emulation.setDeviceMetricsOverride",{width:472,height:868,deviceScaleFactor:1,mobile:true});
  await evaluate("document.querySelector('[data-menu-toggle]').click()");
  assert.equal(await evaluate("document.querySelector('.home-menu').open"),true);
  assert.equal(await evaluate("document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded')"),"true");
  await screenshot("narke-home-menu");
  await evaluate("document.querySelector('[data-menu-close]').click()");
  assert.equal(await evaluate("document.querySelector('.home-menu').open"),false);
  await evaluate("document.querySelector('[data-notification-open]').click()");
  await waitFor("document.querySelector('.platform-notification-dialog').open");
  await screenshot("narke-home-notification");
  await evaluate("document.querySelector('[data-notification-close]').click()");
  assert.equal(await evaluate("document.querySelectorAll('[data-slide]').length"),4);
  for (let index=0;index<4;index++) {
    await evaluate(`document.querySelector('[data-slide="${index}"]').click()`);
    assert.equal(await evaluate("document.querySelectorAll('[data-slide][aria-pressed=true]').length"),1);
    assert.equal(await evaluate("Number(document.querySelector('[data-slide][aria-pressed=true]').dataset.slide)"),index);
    assert.equal(await evaluate("document.querySelectorAll('.hero-slide.is-active').length"),1);
  }
  await evaluate("document.querySelector('[data-slide=\"3\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('[data-slide=\"0\"]').getAttribute('aria-pressed')"),"true");
  await evaluate(`document.querySelector('.home-hero').dispatchEvent(new PointerEvent('pointerdown',{clientX:400,clientY:300,bubbles:true}));
    document.querySelector('.home-hero').dispatchEvent(new PointerEvent('pointerup',{clientX:300,clientY:302,bubbles:true}));`);
  assert.equal(await evaluate("document.querySelector('[data-slide=\"1\"]').getAttribute('aria-pressed')"),"true");
  await call("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  await evaluate("document.querySelector('[data-slide=\"0\"]').click(); document.activeElement.blur()");
  await call("Emulation.setEmulatedMedia",{features:[]});
  assert.equal(await evaluate("[...document.querySelectorAll('.product-card')].filter(card=>!card.hidden).length"),4);
  await evaluate("document.querySelector('[data-show-all]').click()");
  assert.equal(await evaluate("[...document.querySelectorAll('.product-card')].filter(card=>!card.hidden).length"),6);
  await evaluate("document.querySelector('[data-show-all]').click()");
  assert.equal(await evaluate("[...document.querySelectorAll('.product-card')].filter(card=>!card.hidden).length"),4);
  await evaluate("document.querySelector('.home-hero a[href=\"#catalog\"]').click()");
  await waitFor("location.hash==='#catalog'");
  const userBefore=await evaluate("fetch('/api/me').then(r=>r.json())");
  const available=cards.find(card=>!card.disabled);
  assert(available,"A real active offer is needed to verify the purchase dialog");
  await evaluate(`(()=>{
    const card=document.querySelector('[data-vip="${available.code}"]');
    card.dataset.price=String(Number(card.dataset.price)+1);
    card.querySelector('[data-purpose=buy-btn]').click();
  })()`);
  assert.equal(await evaluate("document.querySelector('.purchase-dialog').open"),true);
  assert(await evaluate(`document.querySelector('[data-detail-price]').textContent.includes(${JSON.stringify(String(available.price+1))}.replace(/\\B(?=(\\d{3})+(?!\\d))/g,' '))`));
  await screenshot("narke-home-purchase");
  await evaluate("document.querySelector('.confirm-purchase').click()");
  await waitFor("document.querySelector('.purchase-error').textContent.includes('prix a changé')");
  assert.equal(await evaluate("fetch('/api/me').then(r=>r.json()).then(user=>user.balance_fcfa)"),userBefore.balance_fcfa);
  assert.equal(await evaluate("sessionStorage.getItem('shineray-vip-purchase-request')"),null);
  await evaluate("document.querySelector('.cancel-purchase').click()");
  for (const route of ["/recharger","/retrait","/service-client"]) {
    await openHome();
    await evaluate(`document.querySelector('[data-route="${route}"]').click()`);
    await waitFor(`location.pathname===${JSON.stringify(route)} && document.readyState==='complete'`);
  }
  for (const route of ["/projet","/equipe","/compte"]) {
    await openHome();
    await evaluate(`document.querySelector('.bottom-navigation a[href="${route}"]').click()`);
    await waitFor(`location.pathname===${JSON.stringify(route)} && document.readyState==='complete'`);
  }
  console.log("PASS: NARKE signed-in home at seven widths, live canonical catalogue/amounts, menu, real notification, four carousel slides/keyboard/swipe, six accessible offers, discover/show-all, all quick and bottom routes, real stale-price purchase rejection without debit.");
};

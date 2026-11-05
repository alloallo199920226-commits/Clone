const assert = require("node:assert/strict");
module.exports = async ({ call, evaluate, navigate, waitFor, screenshot, userId }) => {
  const routes = ["/accueil", "/projet", "/equipe", "/mon-equipe", "/compte",
    "/notifications", "/missions", "/missions-vip", "/recharger", "/retrait",
    "/historique-recharges", "/historique-retraits", "/financement",
    "/gestion-compte-bancaire", "/ajouter-compte-retrait",
    "/a-propos", "/regles", "/service-client", "/choisir-operateur", "/confirmation-depot"];
  const legacy = /\b(?:IVECO|SHINERAY|SWM|Sprite|AERONOVA|Valhalla)\b/i;
  for (const route of routes) {
    await navigate(route);
    await waitFor("document.readyState==='complete' && !!document.querySelector('script[src^=\"/pages/narke-brand.js\"]')");
    await waitFor("!document.querySelector('[data-navigation-loader]') || document.querySelector('[data-navigation-loader]').hidden");
    const brand = await evaluate(`({
      title:document.title,
      text:document.body.innerText,
      meta:[...document.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[name="application-name"],meta[name="apple-mobile-web-app-title"]')].map(n=>n.content).join(' '),
      icons:[...document.querySelectorAll('link[rel*="icon"]')].map(n=>n.getAttribute('href')),
      theme:document.querySelector('meta[name="theme-color"]')?.content,
      images:[...document.images].map(n=>n.getAttribute('src'))
    })`);
    assert(!legacy.test(brand.title + " " + brand.text + " " + brand.meta), `Legacy visible brand on ${route}`);
    assert.match(brand.title, /NARKE/i);
    assert.equal(brand.theme, "#00131e");
    assert.equal(brand.icons.length, 3);
    assert(brand.icons.every(href => !legacy.test(href)), `Legacy favicon on ${route}`);
    assert(!brand.images.some(src=>/iveco-/i.test(src)), `Legacy image on ${route}`);
    if (["/financement","/gestion-compte-bancaire","/ajouter-compte-retrait"].includes(route)) {
      await waitFor("!!document.querySelector('.narke-record-page')");
      await waitFor("[...document.images].every(i=>i.complete&&i.naturalWidth>0)");
      for (const [width,height] of [[320,568],[390,844],[768,1024],[1280,900]]) {
        await call("Emulation.setDeviceMetricsOverride", {width,height,deviceScaleFactor:1,mobile:true});
        assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `Overflow ${route} at ${width}`);
        assert(await evaluate("!['rgb(255, 255, 255)','rgb(242, 242, 242)'].includes(getComputedStyle(document.body).backgroundColor)"));
        assert(await evaluate("!['rgb(255, 255, 255)','rgb(241, 241, 241)'].includes(getComputedStyle(document.querySelector('.page-header')).backgroundColor)"));
        assert(await evaluate("!['rgb(0, 0, 0)','rgb(51, 51, 51)'].includes(getComputedStyle(document.querySelector('.page-header h1, main h1')).color)"));
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.page-content, .wallet-content')).backgroundColor"),"rgba(0, 0, 0, 0)");
      }
      await call("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
      if(route==="/financement") {
        await waitFor("document.querySelector('[data-activity-list]').getAttribute('aria-busy')==='false'");
        const data = await evaluate("(async()=>await(await fetch('/api/activity')).json())()");
        const count=await evaluate("document.querySelectorAll('[data-activity-list] .finance-row').length");
        assert.equal(count, data.activities.length, "Ledger displays the real API rows");
      }
      await screenshot("narke-"+route.slice(1));
    }
    if(route==="/notifications") {
      assert.equal(await evaluate("getComputedStyle(document.querySelector('main.page')).backgroundColor"),"rgba(0, 0, 0, 0)");
      await screenshot("narke-notifications");
    }
  }
  const manifest = await evaluate("(async()=>await(await fetch('/manifest.webmanifest')).json())()");
  assert.equal(manifest.name, "NARKE Industries");
  assert.equal(manifest.theme_color, "#00131e");
  for (const icon of manifest.icons) {
    assert(await evaluate(`(async()=>{const image=new Image();image.src=${JSON.stringify(icon.src)};await image.decode();return image.naturalWidth===${Number(icon.sizes.split("x")[0])};})()`));
  }
  await navigate("/compte");
  await evaluate(`(()=>{
    const root=document.createElement('section');
    root.id='narke-brand-test';
    root.innerHTML='<p>IVECO SHINERAY Sprite Valhalla</p><a href="/iveco-account">IVECO</a><input placeholder="IVECO" value="IVECO-value"><img alt="IVECO" src="/pages/assets/iveco-auth-logo.png">';
    document.body.append(root);
    sessionStorage.setItem('narke-presentation-test','IVECO-original');
  })()`);
  await waitFor("document.querySelector('#narke-brand-test p').textContent==='NARKE NARKE NARKE NARKE'");
  assert.equal(await evaluate("document.querySelector('#narke-brand-test input').value"),"IVECO-value");
  assert.equal(await evaluate("document.querySelector('#narke-brand-test input').placeholder"),"NARKE");
  assert.equal(await evaluate("document.querySelector('#narke-brand-test a').getAttribute('href')"),"/iveco-account");
  assert.equal(await evaluate("sessionStorage.getItem('narke-presentation-test')"),"IVECO-original");
  assert.equal(await evaluate("document.querySelector('#narke-brand-test img').getAttribute('src')"),"/pages/assets/narke-home-logo.png");
  await require("./wallet-operators-browser.cjs")({userId,evaluate,navigate,waitFor,screenshot});
  await navigate("/gestion-compte-bancaire");
  await waitFor("!document.querySelector('[data-wallet-empty]').hidden");
  await screenshot("narke-wallet-empty");
  // Authenticated visitors are intentionally sent home by the auth scripts.
  // Inspect the served auth documents without disrupting that behavior.
  for (const route of ["/connexion","/inscription"]) {
    const title=await evaluate(`(async()=>{
      const response=await fetch(${JSON.stringify(route)});
      const document=new DOMParser().parseFromString(await response.text(),'text/html');
      return document.title;
    })()`);
    assert.match(title,/NARKE/);
  }
  await navigate("/omarshark-junior-panam");
  await waitFor("document.querySelector('.admin-login-brand img')?.naturalWidth>0");
  assert(!legacy.test(await evaluate("document.title+' '+document.body.innerText")));
  assert(await evaluate("!!document.querySelector('link[href=\"/pages/narke-admin.css\"]')"));
  assert.equal(await evaluate("document.documentElement.dataset.platformTheme"),"narke");
  await screenshot("narke-admin-login");
  console.log("PASS: 20 member routes, metadata, browser icons/manifest, dynamic branding without rewriting values/URLs/storage, three responsive redesigned pages, six real wallet saves and admin login. No live payment.");
};

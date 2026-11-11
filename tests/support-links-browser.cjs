const assert = require("node:assert/strict");

module.exports = async ({call, evaluate, navigate, waitFor, screenshot}) => {
  const whatsapp = "https://chat.whatsapp.com/FsLLzRGELbHDBefDY3JLQp?s=cl&p=i&mlu=4&ilr=4&iam=2";
  const group = "https://t.me/+uZ-9XZeYk35lOWU0";
  const support = "https://t.me/Narkeyatch";
  const popupSupport = "https://whatsapp.com/channel/0029VbEIGFwCXC3P9ltlHF02";
  for (const width of [320, 390, 472]) {
    await call("Emulation.setDeviceMetricsOverride", {width, height:844, deviceScaleFactor:1, mobile:true});
    await navigate("/accueil");
    await waitFor("Boolean(document.querySelector('.platform-notification-dialog[open]'))");
    const popup = await evaluate(`(() => {
      const d=document.querySelector('.platform-notification-dialog');
      const close=d.querySelector('[data-notification-close]').getBoundingClientRect();
      return {text:d.textContent, links:[...d.querySelectorAll('a')].map(a=>({
        text:a.textContent, href:a.href, target:a.target, rel:a.rel
      })), fits:document.documentElement.scrollWidth<=innerWidth && close.bottom<=innerHeight};
    })()`);
    assert(popup.text.includes("2 500 FCFA"));
    assert(popup.text.includes("toutes les 24 heures après l’achat"));
    assert(popup.text.includes("09 h à 18 h, heure du Maroc"));
    assert(!popup.text.includes("références non activées"));
    assert(!popup.text.includes("à tout moment"));
    assert(!popup.text.includes("Chaîne Telegram"));
    assert.deepEqual(popup.links.map(a=>a.href), [whatsapp, group, popupSupport]);
    assert.equal(popup.links[0].text, "Groupe WhatsApp");
    assert.equal(popup.links[2].text, "Chaîne WhatsApp");
    assert(popup.links.every(a=>a.target==="_blank" && a.rel.includes("noopener")));
    assert(popup.fits, "Popup fits screen");
    if (width === 390) await screenshot("iveco-notification-contacts");
    await evaluate("document.querySelector('[data-notification-close]').click()");
    await navigate("/service-client");
    await waitFor("document.querySelectorAll('.reference-contact[href]').length===3");
    const contacts = await evaluate(`({
      links:[...document.querySelectorAll('.reference-contact')].map(a=>a.href),
      text:document.body.textContent,
      fits:document.documentElement.scrollWidth<=innerWidth
    })`);
    assert.deepEqual(contacts.links, [support, whatsapp, group]);
    assert(contacts.text.includes("@Narkeyatch"));
    assert(!contacts.text.includes("Contact indisponible"));
    assert(!contacts.text.includes("Chaîne Telegram"));
    assert(contacts.fits, "Contacts fit screen");
    if (width === 390) await screenshot("iveco-service-contacts");
  }
  console.log("PASS: popup-only WhatsApp service link updated; service page retains @Narkeyatch; group links unchanged; no overflow at320/390/472px. External destinations were not contacted.");
};

/* Visible branding only: never rewrite identifiers, URLs, stored data or forms. */
(() => {
  "use strict";
  const legacyBrand = /\b(?:SHINERAY|SWM|Sprite|AERONOVA)\b/gi;
  const excluded = "script,style,noscript,textarea,input,code,pre,[contenteditable]";
  const attributes = ["title", "alt", "aria-label", "placeholder"];
  const replace = value => value.replace(legacyBrand, "IVECO")
    .replace(/\bsonara[\s-]*pay\b/gi, "service de paiement");

  function text(node) {
    if (!node.parentElement || node.parentElement.closest(excluded)) return;
    const branded = replace(node.data);
    if (branded !== node.data) node.data = branded;
  }

  function labels(element) {
    for (const name of attributes) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const branded = replace(value);
      if (branded !== value) element.setAttribute(name, branded);
    }
  }

  function rewrite(root) {
    if (root.nodeType === Node.TEXT_NODE) return text(root);
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest("script,style,noscript,textarea,code,pre,[contenteditable]")) return;
    labels(root);
    for (const element of root.querySelectorAll("[title],[alt],[aria-label],[placeholder]")) {
      if (!element.closest("script,style,noscript,[contenteditable]")) labels(element);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) text(walker.currentNode);
  }

  rewrite(document.documentElement);
  const adminBrand = document.querySelector(".admin-login-brand");
  if (adminBrand) {
    const image = document.createElement("img");
    image.src = "/pages/assets/iveco-auth-logo.png";
    image.alt = "IVECO";
    image.width = 244;
    image.height = 45;
    Object.assign(image.style, { display: "block", width: "244px", maxWidth: "100%", height: "auto" });
    adminBrand.replaceChildren(image);
  }
  new MutationObserver(records => {
    const changed = new Set();
    for (const record of records) {
      if (record.type === "attributes") labels(record.target);
      else if (record.type === "characterData") changed.add(record.target);
      else for (const node of record.addedNodes) changed.add(node);
    }
    for (const node of changed) rewrite(node);
  }).observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: attributes
  });
})();

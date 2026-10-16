const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

function setup() {
  const document = { body: { style: { overflow: "auto" } }, listeners: {},
    addEventListener(name, handler) { this.listeners[name] = handler; } };
  function element(dataset = {}) {
    return {
      dataset, hidden: false, attributes: {}, listeners: {}, value: "", textContent: "", children: [],
      addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { document.activeElement = this; },
      dispatchEvent() {}, append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      closest(selector) {
        if (selector === "[data-country-code]" && this.dataset.countryCode) return this;
        if (selector === "[data-country-close]" && this.isClose) return this;
        return null;
      },
    };
  }
  const overlay = element();
  overlay.hidden = true;
  const sheet = element(), trigger = element(), input = element(), label = element();
  const prefix = element(), page = element(), options = element(), close = element();
  const errorBox = element(), errorMessage = element(), retry = element(), loadingText = element();
  close.isClose = true;
  options.querySelector = () => options.children[0];
  options.querySelectorAll = () => options.children;
  overlay.querySelector = selector => ({
    ".country-sheet": sheet, ".country-options": options, "[data-country-close]": close,
    "[data-country-error]": errorBox, "[data-country-message]": errorMessage,
    "[data-country-retry]": retry, "[data-country-loading] .sr-only": loadingText,
  })[selector];
  document.querySelector = selector => ({
    "[data-country-overlay]": overlay, ".country-trigger": trigger,
    'input[name="country"]': input, "[data-country-label]": label,
    "[data-phone-prefix]": prefix, ".auth-page": page,
  })[selector];
  document.createElement = () => element();
  const timers = new Map();
  const requests = [];
  const window = {};
  vm.runInNewContext(fs.readFileSync("pages/country-picker.js", "utf8"), {
    window, document, Event: class {}, AbortController, DOMException,
    fetch(url, { signal }) {
      return new Promise((resolve, reject) => {
        const request = { url, resolve(data) { resolve({ ok: true, json: async () => data }); }, reject };
        requests.push(request);
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    },
    setTimeout(fn, delay) { timers.set(delay, fn); return delay; },
    clearTimeout(id) { timers.delete(id); },
  });
  window.setupCountryPicker();
  return { overlay, sheet, trigger, input, label, prefix, page, options, close,
    document, timers, requests, errorBox, errorMessage, retry };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const countries = { countries: [
  { code: "+228", name: "Togo" }, { code: "+225", name: "Côte d’Ivoire" },
] };

test("each loading stage waits for its own real response, even after its display minimum", async () => {
  const ui = setup();
  ui.trigger.listeners.click();
  assert.equal(ui.overlay.dataset.stage, "spinner");
  assert.equal(ui.options.hidden, true);
  assert.equal(ui.page.inert, true);
  ui.timers.get(600)();
  await settle();
  assert.equal(ui.overlay.dataset.stage, "spinner");
  assert.equal(ui.requests.length, 1);
  ui.requests[0].resolve({ countries_url: "/api/countries" });
  await settle();
  assert.equal(ui.overlay.dataset.stage, "dots");
  assert.equal(ui.requests[1].url, "/api/countries");
  ui.timers.get(800)();
  await settle();
  assert.equal(ui.overlay.dataset.stage, "dots");
  ui.requests[1].resolve(countries);
  await settle();
  assert.equal(ui.overlay.dataset.stage, "ready");
  assert.equal(ui.options.children.length, 2);
  ui.overlay.listeners.click({ target: ui.options.children[1] });
  assert.equal(ui.input.value, "+225");
  assert.equal(ui.label.textContent, "Côte d’Ivoire (+225)");
  assert.equal(ui.overlay.hidden, true);
  assert.equal(ui.page.inert, false);
  assert.equal(ui.document.body.style.overflow, "auto");
  assert.equal(ui.document.activeElement, ui.trigger);
});

test("offline failure shows retry without a local fallback; retry loads fresh server data", async () => {
  const ui = setup();
  ui.trigger.listeners.click();
  ui.requests[0].reject(new Error("Offline"));
  await settle();
  assert.equal(ui.overlay.dataset.stage, "error");
  assert.equal(ui.errorBox.hidden, false);
  assert.equal(ui.options.hidden, true);
  assert.match(ui.errorMessage.textContent, /connexion Internet/);
  const retryLoad = ui.retry.listeners.click();
  ui.timers.get(600)();
  ui.requests[1].resolve({ countries_url: "/api/countries" });
  await settle();
  ui.timers.get(800)();
  ui.requests[2].resolve(countries);
  await retryLoad;
  assert.equal(ui.overlay.dataset.stage, "ready");
});

test("closing aborts pending requests and stale results cannot reopen the sheet", async () => {
  const ui = setup();
  ui.trigger.listeners.click();
  ui.document.listeners.keydown({ key: "Escape", preventDefault() {} });
  await settle();
  assert.equal(ui.overlay.hidden, true);
  assert.equal(ui.timers.has(20000), false);
  ui.trigger.listeners.click();
  assert.equal(ui.overlay.dataset.stage, "spinner");
  ui.requests[0].resolve({ countries_url: "/api/countries" });
  await settle();
  assert.equal(ui.requests.length, 2);
  ui.overlay.listeners.click({ target: ui.close });
  await settle();
  assert.equal(ui.overlay.hidden, true);
});

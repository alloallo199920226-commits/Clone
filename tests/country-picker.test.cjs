const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

function setup() {
  const document = { body: { style: { overflow: "auto" } }, listeners: {},
    addEventListener(name, handler) { this.listeners[name] = handler; } };
  function element(dataset = {}) {
    return {
      dataset, hidden: false, attributes: {}, listeners: {}, value: "", textContent: "",
      addEventListener(name, handler) { this.listeners[name] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus() { document.activeElement = this; },
      dispatchEvent() {},
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
  close.isClose = true;
  const togo = element({ countryCode: "+228", countryName: "Togo" });
  const ivory = element({ countryCode: "+225", countryName: "Côte d’Ivoire" });
  options.querySelector = () => togo;
  options.querySelectorAll = () => [togo, ivory];
  overlay.querySelector = selector => ({
    ".country-sheet": sheet, ".country-options": options, "[data-country-close]": close,
  })[selector];
  document.querySelector = selector => ({
    "[data-country-overlay]": overlay, ".country-trigger": trigger,
    'input[name="country"]': input, "[data-country-label]": label,
    "[data-phone-prefix]": prefix, ".auth-page": page,
  })[selector];
  const timers = new Map();
  const window = {};
  vm.runInNewContext(fs.readFileSync("pages/country-picker.js", "utf8"), {
    window, document, Event: class {},
    setTimeout(fn, delay) { timers.set(delay, fn); return delay; },
    clearTimeout(id) { timers.delete(id); },
  });
  window.setupCountryPicker();
  return { overlay, sheet, trigger, input, label, prefix, page, options, close, togo, ivory, document, timers };
}

test("country sheet progresses through spinner, dots and selectable countries", () => {
  const ui = setup();
  ui.trigger.listeners.click();
  assert.equal(ui.overlay.hidden, false);
  assert.equal(ui.overlay.dataset.stage, "spinner");
  assert.equal(ui.options.hidden, true);
  assert.equal(ui.page.inert, true);
  assert.equal(ui.document.body.style.overflow, "hidden");
  ui.timers.get(160)();
  assert.equal(ui.overlay.dataset.stage, "dots");
  ui.timers.get(460)();
  assert.equal(ui.overlay.dataset.stage, "ready");
  assert.equal(ui.options.hidden, false);
  assert.equal(ui.sheet.attributes["aria-busy"], "false");
  ui.overlay.listeners.click({ target: ui.ivory });
  assert.equal(ui.input.value, "+225");
  assert.equal(ui.label.textContent, "Côte d’Ivoire (+225)");
  assert.equal(ui.prefix.textContent, "+225 ");
  assert.equal(ui.overlay.hidden, true);
  assert.equal(ui.page.inert, false);
  assert.equal(ui.document.body.style.overflow, "auto");
  assert.equal(ui.document.activeElement, ui.trigger);
});

test("dismissal cancels opening timers and reopening works", () => {
  const ui = setup();
  ui.trigger.listeners.click();
  let prevented = false;
  ui.document.listeners.keydown({ key: "Escape", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.overlay.hidden, true);
  ui.trigger.listeners.click();
  ui.timers.get(460)();
  ui.overlay.listeners.click({ target: ui.togo });
  assert.equal(ui.input.value, "+228");
  ui.trigger.listeners.click();
  ui.overlay.listeners.click({ target: ui.close });
  assert.equal(ui.overlay.hidden, true);
});

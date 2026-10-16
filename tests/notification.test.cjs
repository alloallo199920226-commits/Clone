const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");

test("home notification reopens after dismissal on every pageshow, including history", async () => {
  const events = {};
  let fetches = 0;
  let openings = 0;
  let closeClick;
  let dialog;
  const closeButton = {
    style: {},
    focus() {},
    addEventListener(_, fn) { closeClick = fn; },
  };
  const card = {
    style: {},
    querySelectorAll() { return []; },
    querySelector() { return closeButton; },
  };
  const document = {
    body: { append() {} },
    head: { append() {} },
    createElement(tag) {
      if (tag === "dialog") {
        dialog = {
          open: false, style: {}, append() {}, setAttribute() {},
          showModal() { this.open = true; openings++; },
          close() { this.open = false; },
        };
        return dialog;
      }
      return {};
    },
  };
  const context = {
    document,
    window: { addEventListener(name, fn) { events[name] = fn; } },
    DOMParser: class { parseFromString() { return { querySelector() { return card; } }; } },
    async fetch(url) {
      assert.equal(url, "/notifications");
      fetches++;
      return { ok: true, redirected: false, async text() { return "<section></section>"; } };
    },
  };
  vm.runInNewContext(fs.readFileSync("pages/notification.js", "utf8"), context);
  await events.pageshow({ persisted: false });
  assert.equal(openings, 1);
  assert.equal(dialog.open, true);
  await events.pageshow({ persisted: false });
  assert.equal(openings, 1, "must not create duplicate open dialogs");
  closeClick();
  assert.equal(dialog.open, false);
  await events.pageshow({ persisted: true });
  assert.equal(openings, 2, "browser history return must reopen the notification");
  closeClick();
  await events.pageshow({ persisted: false });
  assert.equal(openings, 3);
  assert.equal(fetches, 1);
});

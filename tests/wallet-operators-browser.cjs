const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

module.exports = async ({ userId, evaluate, navigate, waitFor, screenshot }) => {
  try {
    for (const provider of ["TOGOCEL", "MOOV", "MTN", "ORANGE", "AIRTEL", "WAVE"]) {
      await navigate("/ajouter-compte-retrait");
      assert.deepEqual(await evaluate("Array.from(document.querySelector('#wallet-type').options).map(o=>o.value).filter(Boolean)"),
        ["TOGOCEL", "MOOV", "MTN", "ORANGE", "AIRTEL", "WAVE"]);
      if (provider === "MOOV") await screenshot("withdrawal-wallet-operators");
      await evaluate(`document.querySelector('#wallet-type').value=${JSON.stringify(provider)};
        document.querySelector('#wallet-holder').value='Titulaire test';
        document.querySelector('#wallet-number').value='90000000';
        document.querySelector('[data-wallet-form]').requestSubmit()`);
      await waitFor("location.pathname === '/gestion-compte-bancaire'");
      await waitFor(`document.querySelector('[data-wallet-list]')?.textContent.includes(${JSON.stringify(provider)})`);
    }
    await navigate("/retrait");
    await waitFor("document.querySelectorAll('[data-wallet-options] button').length===6");
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
    const wallets = await evaluate("fetch('/api/wallets').then(r=>r.json())");
    assert.equal(wallets.wallets.length, 6);
    assert(wallets.wallets.every(w => w.phone === "+22890000000" && w.holder_name === "Titulaire test"));
    console.log("PASS: six wallet options, real form submissions, persistence, listing and withdrawal selection.");
  } finally {
    execFileSync("python3", ["-c", `import auth_backend
with auth_backend.connect() as c,c.cursor() as cur:
 cur.execute('DELETE FROM shineray_wallets WHERE user_id=%s',(${Number(userId)},))`]);
  }
};

const assert = require("node:assert/strict");
module.exports = async ({evaluate, waitFor, navigate, screenshot}) => {
  await navigate("/omarshark-junior-panam");
  await evaluate("document.querySelector('#admin-password').value='isolated-browser-console-password';document.querySelector('#admin-login').requestSubmit()");
  await waitFor("document.querySelector('#dashboard-view').hidden===false && document.querySelector('[data-tab=overview].active')");
  assert.equal(await evaluate("fetch('/api/admin/today-withdrawals').then(r=>r.status)"), 200);
  // Isolated browser fixture only; no real withdrawal is approved or refused.
  await evaluate(`{
    const originalFetch=window.fetch;
    window.fetch=(url,options)=>{
      if(String(url).startsWith('/api/admin/today-withdrawals?'))
        return Promise.resolve(new Response(JSON.stringify({total:1,nextCursor:null,transactions:[{
          id:'withdraw-fixture',type:'withdrawal',amount:2300,status:'pending',
          purchasedVipToday:true,referralCommissionToday:true,userId:999,
          registrationNumber:'Compte de test',operatorName:'WAVE',walletHolderName:'Test',
          destination:'Numéro de test',fee:460,netAmount:1840,referralCount:1,
          referralCommissionAmount:1400,orderNumber:'TEST',createdAt:new Date().toISOString()
        }]}),{status:200,headers:{'Content-Type':'application/json'}}));
      return originalFetch(url,options);
    };
    window.openTodayTab=()=>[...document.querySelectorAll('#general-admin-nav button')]
      .find(b=>b.textContent.includes('Activité du jour')).click();
    window.openTodayTab();
  }`);
  await waitFor("document.querySelector('[data-history-list]')?.textContent.includes('Commission de parrainage reçue aujourd’hui')");
  assert.equal(await evaluate("document.querySelectorAll('[data-history-list] article').length"), 1);
  assert(await evaluate("document.querySelector('[data-history-list]').textContent.includes('VIP acheté aujourd’hui')"));
  assert(await evaluate("[...document.querySelectorAll('[data-history-filter]')].every(s=>s.disabled)"));
  assert(await evaluate("document.querySelector('[data-history-action=approved]')!==null"));
  await screenshot("admin-today-withdrawals");
  await evaluate("document.querySelector('#refresh').click()");
  await waitFor("document.querySelector('[data-history-list]')?.textContent.includes('Compte de test')");
  await evaluate("document.querySelector('[data-tab=overview]').click()");
  assert(await evaluate("!document.querySelector('#admin-content').hidden"));
  assert(await evaluate("document.querySelector('[data-tab=overview]').classList.contains('active')"));
  await evaluate("window.openTodayTab();document.querySelector('[data-tab=history]').click()");
  await waitFor("!document.querySelector('#admin-content').hidden && document.querySelector('#admin-content [data-history-panel]')");
  await evaluate("window.openTodayTab();document.querySelector('#logout').click()");
  await waitFor("document.querySelector('#login-view').hidden===false");
  assert.equal(await evaluate("fetch('/api/admin/today-withdrawals').then(r=>r.status)"), 401);
  console.log("PASS: dedicated tab, both activity badges without duplicates, locked pending filters, actions, refresh, navigation and logout. No payout submitted.");
};

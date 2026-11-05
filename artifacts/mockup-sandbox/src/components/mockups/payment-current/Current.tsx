import source from './_source.html?raw';
import flow from './_deposit-flow.css?raw';
import payment from './_iveco-payment.css?raw';

// Exact static source extraction; all production scripts and payment calls removed.
const assets = '/__mockup/images/narke-payment/';
const initialize = `
document.querySelector('[data-deposit-amount]').textContent='FCFA 3 500';
document.querySelector('[data-deposit-prefix]').textContent='+226';
document.querySelector('[data-deposit-flag]').textContent='BF';
document.querySelector('[data-submit-label]').textContent='Lancer le paiement';
const options=document.querySelector('.deposit-operator-options');
[['orange','Orange Money'],['moov','Moov Money'],['telecel','Telecel Cash']].forEach(([id,name])=>{
 const choice=document.createElement('div');choice.className='deposit-operator-choice';
 const logo=document.createElement('span');logo.className='operator-logo operator-logo--'+id;logo.textContent=name;
 const button=document.createElement('button');button.type='button';button.className='deposit-operator';button.dataset.operator=id;
 const label=document.createElement('span');label.className='deposit-operator-name';label.textContent=name;
 const check=document.createElement('span');check.className='deposit-check';check.textContent='✓';button.append(label,check);
 button.onclick=()=>{document.querySelectorAll('[data-operator]').forEach(x=>x.setAttribute('aria-pressed',String(x===button)));document.querySelector('[data-orange-otp]').hidden=id!=='orange';};
 choice.append(logo,button);options.append(choice);if(id==='orange')button.click();
});
document.querySelector('[data-i18n="orangeOtpHelp"]').textContent='Composez *144*4*6*3500# pour obtenir votre code temporaire. Ce code n’est pas votre PIN.';
document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('[data-deposit-status]').textContent='Maquette uniquement — aucun paiement envoyé.';};
document.querySelectorAll('a').forEach(a=>a.onclick=e=>e.preventDefault());
`;
const extracted = source
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link[^>]+rel="stylesheet"[^>]*>/g, '')
  .replace('</head>', `<style>${flow}\n${payment}</style></head>`)
  .replaceAll('/pages/assets/', assets)
  .replace('</body>', `<script>${initialize}</script></body>`);

export function Current() {
  return <iframe title="Paiement actuel extrait — données de démonstration" srcDoc={extracted}
    sandbox="allow-scripts" style={{display:'block',width:'100%',height:'100dvh',border:0}} />;
}

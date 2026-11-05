import { PreviewFrame, assetRoot, linkTo } from './_shared';
import styles from './_group.css?raw';

const html = `
<main class="scene">
  <header class="topbar">
    <a class="brand" href="${linkTo('Payment')}" aria-label="NARKE, accueil de la maquette"><img src="${assetRoot}narke-project-logo.png" alt="NARKE"><span class="brand-word">Recharge<br>électrique</span></a>
    <span class="demo-tag"><b>MAQUETTE</b> · données fictives</span>
  </header>
  <div class="experience">
    <p class="eyebrow">NARKE Industries · Burkina Faso</p>
    <h1 class="story-title">L’océan vous<br>attend <em>à nouveau.</em></h1>
    <p class="scene-caption">Rechargez votre expérience, simplement.</p>
    <section class="surface" aria-labelledby="payment-title">
      <div class="surface-heading">
        <div><h2 id="payment-title">Votre recharge</h2><p>Choisissez votre portefeuille mobile.</p></div>
        <span class="step-index">ÉTAPE 01 / 02</span>
      </div>
      <div class="amount-strip"><span>Montant à recharger</span><strong>3 500 FCFA</strong></div>
      <form id="payment-form" novalidate>
        <fieldset style="padding:0;border:0;margin:0">
          <legend class="form-label">Opérateur mobile</legend>
          <div class="operator-list" role="group" aria-label="Sélectionner un opérateur">
            <button class="operator" type="button" data-operator="orange" aria-pressed="true">Orange Money</button>
            <button class="operator" type="button" data-operator="moov" aria-pressed="false">Moov Money</button>
            <button class="operator" type="button" data-operator="telecel" aria-pressed="false">Telecel Cash</button>
          </div>
        </fieldset>
        <div class="field-block">
          <label class="form-label" for="phone">Numéro du portefeuille</label>
          <div class="phone-field"><span class="phone-prefix" aria-label="Indicatif Burkina Faso">BF&nbsp; +226</span><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="Votre numéro de téléphone" aria-describedby="phone-hint" required></div>
          <p class="field-help" id="phone-hint">Saisissez le numéro associé à votre compte Mobile Money.</p>
        </div>
        <div class="otp-panel" id="orange-details">
          <label class="otp-label" for="temporary-code">Code temporaire de l’opérateur <span>(pas votre PIN)</span></label>
          <p class="otp-help">Pour Orange Money, composez <code>*144*4*6*3500#</code> sur votre téléphone. Saisissez ici le code temporaire reçu, si demandé.</p>
          <input class="otp-input" id="temporary-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="12" pattern="[0-9]{4,12}" placeholder="Code temporaire (facultatif)">
          <p class="pin-note">Ne saisissez jamais votre code PIN Mobile Money sur ce site.</p>
          <div class="ussd-compact"><span>Code USSD à composer</span><code>*144*4*6*3500#</code></div>
        </div>
        <p id="other-operator-note" class="field-help" hidden>Suivez les instructions affichées par votre opérateur. Ne communiquez jamais votre code PIN.</p>
        <button class="submit" type="submit"><span>Continuer vers le suivi</span><span aria-hidden="true">→</span></button>
        <p class="local-note" id="form-message" role="status" aria-live="polite">Cette maquette ne lance aucun paiement réel. Référence de démonstration : DEMO-NA-3500.</p>
      </form>
    </section>
  </div>
  <footer class="bottom-mark">NARKE <span>— L’énergie du large.</span></footer>
</main>
<script>
  const choices=[...document.querySelectorAll('[data-operator]')];
  const orange=document.getElementById('orange-details');
  const other=document.getElementById('other-operator-note');
  let selected='orange';
  choices.forEach(button=>button.addEventListener('click',()=>{
    selected=button.dataset.operator;
    choices.forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
    orange.hidden=selected!=='orange';
    other.hidden=selected==='orange';
  }));
  document.getElementById('payment-form').addEventListener('submit',event=>{
    event.preventDefault();
    const phone=document.getElementById('phone').value.trim();
    if(!phone){document.getElementById('form-message').textContent='Veuillez saisir votre numéro de portefeuille pour continuer la démonstration.';document.getElementById('phone').focus();return;}
    const ref='DEMO-NA-3500';
    location.href='${linkTo('Pending')}?ref='+encodeURIComponent(ref);
  });
</script>`;

export function Payment() {
  return <PreviewFrame title="NARKE — formulaire de recharge immersif (maquette)" html={html} css={styles} />;
}

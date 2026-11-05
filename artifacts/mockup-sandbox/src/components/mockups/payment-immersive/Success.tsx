import { PreviewFrame, assetRoot, linkTo } from './_shared';
import styles from './_group.css?raw';

const html = `
<main class="scene">
  <header class="topbar"><a class="brand" href="${linkTo('Payment')}"><img src="${assetRoot}narke-project-logo.png" alt="NARKE"><span class="brand-word">Recharge<br>électrique</span></a><span class="demo-tag"><b>MAQUETTE</b> · données fictives</span></header>
  <div class="experience state-layout">
    <section class="state-art" aria-labelledby="success-title">
      <div class="result-symbol result-symbol--success" aria-hidden="true">✓</div>
      <p class="state-kicker">Crédit confirmé · résultat fictif</p>
      <h1 class="state-title" id="success-title">Prêt pour<br>le <em>large.</em></h1>
      <p class="state-lede">La recharge a été créditée dans cet exemple de réussite. Le parcours réel n’est pas connecté à un opérateur.</p>
    </section>
    <section class="surface" aria-label="Confirmation de recharge">
      <div class="surface-heading"><div><h2>Recharge créditée</h2><p>La transaction de démonstration est confirmée.</p></div><span class="step-index">CONFIRMÉ</span></div>
      <strong class="result-amount">3 500 FCFA</strong>
      <div class="result-status" role="status" aria-live="polite"><span class="status-dot"></span><div><strong>Crédit confirmé</strong><small>Ce succès représente uniquement un état de maquette fictif.</small></div></div>
      <div class="reference"><span>Référence de démonstration</span><strong>DEMO-NA-3500</strong></div>
      <p class="state-copy">Votre solde est affiché comme crédité dans ce scénario de réussite. Aucun paiement réel n’a été effectué.</p>
      <div class="action-stack">
        <a class="action-link" href="${linkTo('Payment')}"><span>Préparer une autre recharge</span><span aria-hidden="true">→</span></a>
        <a class="action-link secondary" href="${linkTo('Pending')}"><span>Voir l’exemple de suivi</span><span aria-hidden="true">↗</span></a>
      </div>
    </section>
  </div>
  <footer class="bottom-mark">NARKE <span>— L’énergie du large.</span></footer>
</main>`;

export function Success() {
  return <PreviewFrame title="NARKE — recharge créditée (maquette)" html={html} css={styles} />;
}

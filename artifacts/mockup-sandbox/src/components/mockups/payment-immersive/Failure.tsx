import { PreviewFrame, assetRoot, linkTo } from './_shared';
import styles from './_group.css?raw';

const html = `
<main class="scene">
  <header class="topbar"><a class="brand" href="${linkTo('Payment')}"><img src="${assetRoot}narke-project-logo.png" alt="NARKE"><span class="brand-word">Recharge<br>électrique</span></a><span class="demo-tag"><b>MAQUETTE</b> · données fictives</span></header>
  <div class="experience state-layout">
    <section class="state-art" aria-labelledby="failure-title">
      <div class="result-symbol result-symbol--failure" aria-hidden="true">×</div>
      <p class="state-kicker">Le parcours est terminé</p>
      <h1 class="state-title" id="failure-title">Pas de<br><em>confirmation.</em></h1>
      <p class="state-lede">Cette demande fictive s’est terminée sans confirmation de crédit. Prenez le temps de vérifier la situation auprès de votre opérateur.</p>
    </section>
    <section class="surface" aria-label="Résultat de la demande">
      <div class="surface-heading"><div><h2>Recharge non confirmée</h2><p>Le résultat ne confirme pas de crédit.</p></div><span class="step-index">TERMINÉ</span></div>
      <strong class="result-amount">3 500 FCFA</strong>
      <div class="result-status" role="alert"><span class="status-dot status-dot--warning"></span><div><strong>Crédit non confirmé</strong><small>Échec de démonstration · référence DEMO conservée.</small></div></div>
      <div class="reference"><span>Référence de démonstration</span><strong>DEMO-NA-3500</strong></div>
      <div class="notice-box"><strong>À vérifier avant toute action.</strong> Ce statut ne permet pas de savoir si votre opérateur a débité votre compte. Consultez son historique ou contactez son assistance avant de recommencer.</div>
      <div class="action-stack">
        <a class="action-link" href="${linkTo('Pending')}"><span>Consulter le suivi de démonstration</span><span aria-hidden="true">→</span></a>
        <a class="action-link secondary" href="${linkTo('Payment')}"><span>Revenir au formulaire</span><span aria-hidden="true">↗</span></a>
      </div>
    </section>
  </div>
  <footer class="bottom-mark">NARKE <span>— L’énergie du large.</span></footer>
</main>`;

export function Failure() {
  return <PreviewFrame title="NARKE — recharge non confirmée (maquette)" html={html} css={styles} />;
}

import { PreviewFrame, assetRoot, linkTo } from './_shared';
import styles from './_group.css?raw';

const html = `
<main class="scene">
  <header class="topbar"><a class="brand" href="${linkTo('Payment')}"><img src="${assetRoot}narke-project-logo.png" alt="NARKE"><span class="brand-word">Recharge<br>électrique</span></a><span class="demo-tag"><b>MAQUETTE</b> · données fictives</span></header>
  <div class="experience state-layout">
    <section class="state-art" aria-labelledby="pending-title">
      <div class="result-symbol result-symbol--pending" aria-hidden="true">···</div>
      <p class="state-kicker">Une vérification est en cours</p>
      <h1 class="state-title" id="pending-title">Le signal<br>est <em>en route.</em></h1>
      <p class="state-lede">Le réseau mobile peut prendre quelques instants. Cet état est une simulation : aucun paiement n’a été envoyé ni confirmé.</p>
    </section>
    <section class="surface" aria-label="État de la recharge">
      <div class="surface-heading"><div><h2>En attente</h2><p>Nous n’avons pas encore de confirmation de crédit.</p></div><span class="step-index">SUIVI</span></div>
      <strong class="result-amount">3 500 FCFA</strong>
      <div class="result-status" role="status" aria-live="polite"><span class="status-dot"></span><div><strong id="pending-status">Statut toujours en attente</strong><small>Une réponse du réseau est nécessaire avant de confirmer le crédit.</small></div></div>
      <div class="reference"><span>Référence de démonstration</span><strong id="reference">DEMO-NA-3500</strong></div>
      <p class="state-copy">Ne relancez pas une demande tant que son statut n’est pas clarifié. Vérifiez auprès de votre opérateur si nécessaire.</p>
      <div class="action-stack">
        <button class="action-button" id="refresh" type="button"><span>Actualiser le statut</span><span aria-hidden="true">↻</span></button>
        <a class="action-link secondary" href="${linkTo('Payment')}"><span>Retour à la recharge</span><span aria-hidden="true">→</span></a>
      </div>
      <p class="refresh-status" id="refresh-status" role="status" aria-live="polite"></p>
    </section>
  </div>
  <footer class="bottom-mark">NARKE <span>— L’énergie du large.</span></footer>
</main>
<script>
  const params=new URLSearchParams(location.search);
  const reference=params.get('ref');
  if(reference==='DEMO-NA-3500')document.getElementById('reference').textContent=reference;
  document.getElementById('refresh').addEventListener('click',()=>{
    document.getElementById('pending-status').textContent='Toujours en attente';
    document.getElementById('refresh-status').textContent='Aucune nouvelle réponse — référence '+document.getElementById('reference').textContent+' conservée. Cette vérification est locale et fictive.';
  });
</script>`;

export function Pending() {
  return <PreviewFrame title="NARKE — suivi en attente (maquette)" html={html} css={styles} />;
}

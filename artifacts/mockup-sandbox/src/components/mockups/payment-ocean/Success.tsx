import { OceanPage, ResultActions, ResultPanel } from './_OceanPage';

export function Success() {
  return (
    <OceanPage title="Votre espace est prêt pour la suite.">
      <ResultPanel
        kind="success"
        title="Crédit confirmé"
        lead="Le statut de démonstration confirme que le portefeuille a bien été crédité."
        notice="État illustratif uniquement. Dans un parcours réel, ce reçu ne s’afficherait qu’après confirmation du crédit par le service de paiement."
      >
        <ResultActions primaryLabel="Retourner à la recharge" primaryTo="Payment" secondaryLabel="Consulter le suivi" secondaryTo="Pending" />
      </ResultPanel>
    </OceanPage>
  );
}

export default Success;

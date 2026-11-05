import { OceanPage, PendingRefresh, ResultActions, ResultPanel } from './_OceanPage';

export function Pending() {
  return (
    <OceanPage title="Nous suivons la confirmation.">
      <ResultPanel
        kind="pending"
        title="Demande en cours"
        lead="La réponse du réseau n’est pas encore définitive. Cette demande reste en attente, sans nouvel envoi."
        notice="Une réponse lente ou interrompue ne permet pas de conclure à un échec. Vérifiez l’état auprès de votre opérateur avant toute autre action. La référence de démonstration est conservée."
        demoPaths
      >
        <div className="ocean-pay__actions">
          <PendingRefresh />
          <ResultActions primaryLabel="Retour au formulaire" primaryTo="Payment" secondaryLabel="Retour à cette attente" secondaryTo="Pending" />
        </div>
      </ResultPanel>
    </OceanPage>
  );
}

export default Pending;

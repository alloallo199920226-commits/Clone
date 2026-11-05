import { OceanPage, ResultActions, ResultPanel } from './_OceanPage';

export function Failure() {
  return (
    <OceanPage title="Un état à vérifier avec votre opérateur.">
      <ResultPanel
        kind="failure"
        title="Demande non aboutie"
        lead="Le parcours est terminé sans confirmation de crédit. Cela ne permet pas de garantir qu’aucun débit n’a eu lieu."
        notice="Consultez d’abord le solde et l’historique de votre portefeuille auprès de l’opérateur. Ne relancez pas la recharge avant d’avoir vérifié qu’aucun débit n’apparaît."
      >
        <ResultActions primaryLabel="Revenir au formulaire" primaryTo="Payment" secondaryLabel="Vérifier l’état en attente" secondaryTo="Pending" />
      </ResultPanel>
    </OceanPage>
  );
}

export default Failure;

import "./_group.css";
import { SampleLabel, SuitePage } from "./NarkeShell";

const rows = [
  { amount: "FCFA 3 500", reference: "Exemple uniquement", channel: "MTN", status: "Échec", date: "Aucune activité réelle affichée" },
  { amount: "FCFA 3 500", reference: "Exemple uniquement", channel: "MTN", status: "En attente", date: "Aucune activité réelle affichée" },
  { amount: "FCFA 3 500", reference: "Exemple uniquement", channel: "Moov", status: "Réussi", date: "Aucune activité réelle affichée" },
];

export function Deposits() {
  return <SuitePage title="Historique de recharge" back="/compte" active="Mon compte"><div className="np-content">
    <SampleLabel />
    <p className="np-history-note">Exemples de présentation — vos opérations réelles restent chargées depuis votre compte.</p>
    {rows.map((row, index) => <article className="np-card np-activity" key={index}>
      <div className="np-row np-activity-head"><span className="np-wallet-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M15 14h3" /></svg></span><strong>Ordre de dépôt</strong><b>{row.amount}</b></div>
      <div className="np-activity-data">
        <p><span>N° d’affichage</span><strong>{row.reference}</strong></p>
        <p><span>Canal</span><strong>{row.channel}</strong></p>
        <p><span>État</span><strong className={`np-status status-${index}`}>{row.status}</strong></p>
        <p><span>Temps</span><strong>{row.date}</strong></p>
      </div>
      {index === 1 && <button className="np-follow" type="button" disabled>Suivre ce paiement · aperçu désactivé</button>}
    </article>)}
  </div></SuitePage>;
}

export default Deposits;

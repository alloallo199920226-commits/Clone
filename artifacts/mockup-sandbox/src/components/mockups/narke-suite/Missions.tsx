import { useState } from "react";
import "./_group.css";
import { Glyph, SampleLabel, SuitePage } from "./NarkeShell";

const inviteRows = [
  ["Invitez 3 investisseurs de niveau 1", "1 000", "2", "3"],
  ["Invitez 10 investisseurs de niveau 1", "3 000", "2", "10"],
  ["Invitez 30 investisseurs de niveau 1", "10 000", "2", "30"],
];
const vipRows = [
  ["Validez 3 achats VIP", "1 000", "1", "3"],
  ["Validez 10 achats VIP", "3 000", "1", "10"],
  ["Validez 30 achats VIP", "10 000", "1", "30"],
];

export function Missions() {
  const [tab, setTab] = useState<"invite" | "vip">("invite");
  const rows = tab === "invite" ? inviteRows : vipRows;
  return <SuitePage title="Missions" back="/equipe" showTitle={false}><div className="np-content">
    <section className="np-mission-hero">
      <SampleLabel />
      <p className="np-eyebrow">NARKE INDUSTRIES · RÉCOMPENSES</p>
      <h2>Missions<br /><em>{tab === "invite" ? "d’invitation" : "achats VIP"}</em></h2>
      <p>{tab === "invite" ? "Un filleul direct compte après son premier achat VIP. Réclamez chaque récompense une seule fois." : "Achetez le VIP indiqué, puis réclamez son bonus une seule fois."}</p>
    </section>
    <div className="np-tabs" role="tablist" aria-label="Types de mission">
      <button type="button" role="tab" aria-selected={tab === "invite"} onClick={() => setTab("invite")}>Invitations</button>
      <button type="button" role="tab" aria-selected={tab === "vip"} onClick={() => setTab("vip")}>Achats VIP</button>
    </div>
    <section className="np-card np-claimed"><span>Récompenses réclamées</span><strong>0 <small>FCFA</small></strong></section>
    <div className="np-row np-milestone-heading"><Glyph name="team" /><div><small>VOTRE PARCOURS</small><h3>Les paliers</h3></div></div>
    <div className="np-mission-list">{rows.map((row, index) => {
      const progress = Math.min(100, Number(row[2]) / Number(row[3]) * 100);
      return <article className={`np-card np-mission-card tier-${index + 1}`} key={row[0]}>
        <h4>{row[0]}</h4><strong className="np-reward"><Glyph name="gift" /> {row[1]} FCFA</strong><p>{tab === "invite" ? "Invitations validées" : "Achats VIP validés"}</p>
        <div className="np-progress-copy"><span>Actuel <b>{row[2]}</b></span><span>Objectif <b>{row[3]}</b></span></div>
        <div className="np-progress" role="progressbar" aria-label={`${progress}% illustratif`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
        <button type="button" disabled aria-disabled="true">Réclamer · aperçu désactivé</button>
      </article>;
    })}</div>
    <p className="np-mission-note">Les récompenses sont attribuées une seule fois par palier. Progression illustrative uniquement.</p>
  </div></SuitePage>;
}

export default Missions;

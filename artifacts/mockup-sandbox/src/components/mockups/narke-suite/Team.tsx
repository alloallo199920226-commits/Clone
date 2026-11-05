import { useState } from "react";
import "./_group.css";
import { Glyph, SampleLabel, SuitePage } from "./NarkeShell";

const levels = [
  ["Équipe de niveau 1", "40 %", "129", "FCFA 3 000"],
  ["Équipe de niveau 2", "2 %", "5", "FCFA 0"],
  ["Équipe de niveau 3", "1 %", "3", "FCFA 0"],
];

export function Team() {
  const [copied, setCopied] = useState("");
  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${label} copié`);
    } catch {
      setCopied("Copie indisponible dans cet aperçu.");
    }
  };
  return <SuitePage title="Mon équipe" active="Équipe"><div className="np-content">
    <div className="np-row np-team-head"><SampleLabel /><a className="np-pill" href="/__mockup/preview/narke-suite/Missions">Missions ›</a></div>
    <section className="np-card np-invite-line"><Glyph name="team" /><div><strong>361821056C</strong><small>Code d’invitation · illustratif</small></div><button type="button" onClick={() => void copy("361821056C", "Code")}>{copied.includes("Code") ? "Copié" : "Copier le code"}</button></section>
    <section className="np-card np-invite-line"><Glyph name="link" /><div><strong className="np-truncate">https://exemple.narke.test/inscription</strong><small>Lien d’invitation · illustratif</small></div><button type="button" onClick={() => void copy("https://exemple.narke.test/inscription", "Lien")}>{copied.includes("Lien") ? "Copié" : "Copier le lien"}</button></section>
    <p className="np-copy-status" role="status">{copied}</p>
     <div className="np-card np-team-table"><table><thead><tr><th>Taux de commission</th><th>Nombre d’invités</th><th>Revenu</th></tr></thead><tbody>{levels.map((row, index) => <tr key={row[0]}><td><img className="np-level-art" src={`/__mockup/images/narke-mission-${index === 0 ? "blue" : index === 1 ? "gold" : "red"}.webp`} alt="" /><span>{row[0]}</span><b>{row[1]}</b></td><td>{row[2]}</td><td>{row[3]}</td></tr>)}</tbody></table></div>
    <div className="np-stats"><section className="np-card"><strong>137</strong><span>Nombre d’invités</span></section><section className="np-card"><strong>FCFA 3 000</strong><span>Revenus sur invitation</span></section></div>
     <section className="np-card np-bonus"><h2><Glyph name="gift" />Bonus d’invitation</h2>{levels.map((row, i) => <p key={row[0]}><b>Niveau {i + 1}</b><span>Vous recevez {row[1]} du premier dépôt approuvé {i === 0 ? "de votre filleul direct" : "du membre"}.</span></p>)}<div className="np-rule" /><p className="np-legal">Commissions créditées uniquement après approbation du premier dépôt. Les dépôts suivants, inscriptions, bonus et achats ne donnent aucune commission. Exemples visibles dans l’aperçu uniquement.</p></section>
   </div></SuitePage>;
}

export default Team;

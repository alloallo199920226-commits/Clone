import { useState } from "react";
import "./_group.css";
import { SampleLabel, SuitePage } from "./NarkeShell";

const detailRows = [
  ["92****855", "24/10/2026 6:52:03 PM", "FCFA 3 500"],
  ["01****106", "24/10/2026 3:46:00 AM", "FCFA 0"],
  ["96****971", "24/10/2026 3:32:16 AM", "FCFA 0"],
  ["71****355", "24/10/2026 3:31:22 AM", "FCFA 0"],
  ["96****389", "24/10/2026 3:26:44 AM", "FCFA 0"],
  ["72****965", "24/10/2026 2:42:48 AM", "FCFA 0"],
];
const tabs = [["FCFA 3 000.00", "Niveau 1 (129)"], ["FCFA 0.00", "Niveau 2 (5)"], ["FCFA 0.00", "Niveau 3 (3)"]];

export function TeamDetail() {
  const [level, setLevel] = useState(0);
  return <SuitePage title="Mon équipe" back="/equipe"><div className="np-content">
    <SampleLabel />
    <div className="np-team-levels" role="tablist" aria-label="Filtrer les membres par niveau">{tabs.map((tab, index) => <button type="button" role="tab" aria-selected={level === index} onClick={() => setLevel(index)} key={tab[1]}><img src={`/__mockup/images/narke-mission-${index === 0 ? "blue" : index === 1 ? "gold" : "red"}.webp`} alt="" /><strong>{tab[0]}</strong><span>{tab[1]}</span></button>)}</div>
    <p className="np-list-disclaimer">Membres, montants et dates d’exemple — aucune activité réelle.</p>
    <div className="np-member-list">{detailRows.map((row, index) => <article className="np-card np-member" key={row[0]}><img src={`/__mockup/images/narke-suite-model-${index % 3 + 1}.webp`} alt="" /><div><strong>{row[0]}</strong><time>{row[1]}</time></div><b>{level === 0 ? row[2] : "FCFA 0"}</b></article>)}</div>
  </div></SuitePage>;
}

export default TeamDetail;

import { useState } from "react";
import "./_group.css";
import { Glyph, SampleLabel, SuitePage } from "./NarkeShell";

const menuItems = ["Détails du financement", "Historique des recharges", "Registres de retrait", "Gestion de compte bancaire", "À propos de nous", "Règles de la plateforme", "Service client"];
const hrefs = [null, "/__mockup/preview/narke-suite/Deposits", null, null, null, null, "/__mockup/preview/narke-suite/Support"];
const glyphs = ["coins", "history", "withdraw", "wallet", "info", "rules", "service"] as const;

export function Account() {
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftCode, setGiftCode] = useState("");
  const [message, setMessage] = useState("");
  return <SuitePage title="Mon compte" active="Mon compte" showTitle={false}><div className="np-account-hero">
    <section className="np-account-cover">
      <div><small>NUMÉRO DE TÉLÉPHONE</small><strong>229 •• •• •• 36</strong></div>
      <div><small>SOLDE DU COMPTE</small><strong>FCFA 85 300</strong></div>
    </section>
    <div className="np-content">
      <SampleLabel />
      <div className="np-account-actions"><button type="button" disabled aria-disabled="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 15h3" /></svg>Recharger</button><a href="/__mockup/preview/narke-suite/Withdraw"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14m-5-5 5 5-5 5M4 5v14" /></svg>Retirer</a></div>
      <div className="np-divider-label"><span>NARKE</span><b>MARINE</b></div>
       <section className="np-card np-account-menu">{menuItems.slice(0,4).map((label, i) => hrefs[i] ? <a href={hrefs[i] as string} key={label}><Glyph name={glyphs[i]} />{label}<b>›</b></a> : <button type="button" disabled aria-disabled="true" key={label}><Glyph name={glyphs[i]} />{label}<b>›</b></button>)}</section>
      <section className="np-card np-gift"><button type="button" aria-expanded={giftOpen} onClick={() => setGiftOpen(!giftOpen)}><Glyph name="gift" />Code cadeau <span>{giftOpen ? "Réduire" : "Ouvrir"}</span></button>{giftOpen && <form onSubmit={(event) => { event.preventDefault(); setMessage("Échange désactivé dans cet aperçu."); }}><label htmlFor="preview-gift">Saisissez votre code cadeau</label><input id="preview-gift" value={giftCode} onChange={(event) => setGiftCode(event.target.value)} minLength={16} maxLength={64} placeholder="Votre code cadeau" /><button type="submit" disabled={giftCode.length < 16}>Valider le code</button><p role="status">{message || "Aucun code ne sera envoyé depuis l’aperçu."}</p></form>}</section>
       <section className="np-card np-account-menu">{menuItems.slice(4).map((label, i) => hrefs[i + 4] ? <a href={hrefs[i + 4] as string} key={label}><Glyph name={glyphs[i + 4]} />{label}<b>›</b></a> : <button type="button" disabled aria-disabled="true" key={label}><Glyph name={glyphs[i + 4]} />{label}<b>›</b></button>)}<button type="button" disabled aria-disabled="true"><Glyph name="logout" />Sortie sécurisée<b>›</b></button></section>
    </div>
  </div></SuitePage>;
}

export default Account;

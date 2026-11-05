import { useState } from "react";
import "./_group.css";
import { Glyph, SampleLabel, SuitePage } from "./NarkeShell";

export function Withdraw() {
  const [amount, setAmount] = useState("");
  const numericAmount = Number(amount);
  const net = Number.isSafeInteger(numericAmount) && numericAmount > 0 ? numericAmount - Math.floor(numericAmount * 0.2) : 0;
  return <SuitePage title="Retrait" back="/compte"><div className="np-content">
    <SampleLabel />
    <section className="np-card np-balance np-boat" aria-label="Aperçu du solde">
      <span className="np-muted">Solde du compte</span>
      <strong>FCFA 85 300</strong>
      <small>Donnée de démonstration — non liée à un compte</small>
    </section>
    <h2 className="np-section-label">Compte de retrait</h2>
    <button className="np-field np-wallet" type="button" disabled aria-disabled="true">Sélecteur réel indisponible dans l’aperçu <span>›</span></button>
    <div className="np-row np-section-label"><h2>Montant du retrait</h2><span>Frais : 20 %</span></div>
    <label className="np-field"><span>FCFA</span><input type="number" min="2300" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Veuillez choisir le montant du retrait" aria-label="Montant du retrait" /></label>
    <p className="np-net">Montant reçu : FCFA {new Intl.NumberFormat("fr-FR").format(net)}</p>
    <p className="np-minimum">Minimum : 2 300 FCFA · De 09 h à 18 h, heure du Maroc · VIP actif requis.</p>
    <button className="np-disabled" disabled aria-disabled="true">Retirer de l’argent maintenant</button>
    <section className="np-card np-instructions">
      <h2><Glyph name="rules" />Instructions de retrait<span className="np-instruction-boats" aria-hidden="true"><img src="/__mockup/images/narke-model-1.png" alt="" /><img src="/__mockup/images/narke-model-4.png" alt="" /><img src="/__mockup/images/narke-model-2.png" alt="" /></span></h2>
      <ol>
        <li>Vous devez posséder au moins un VIP actif, acheté ou octroyé par l’administration.</li>
        <li>Le minimum de retrait est de 2 300 FCFA. Les demandes sont ouvertes chaque jour de 09 h à 18 h, heure du Maroc (fermeture à 18 h).</li>
        <li>Les frais sont de 20 %, arrondis au FCFA inférieur. Le montant net est indiqué avant confirmation.</li>
        <li>La demande est transmise à l’administration pour versement manuel. Son enregistrement ne signifie pas que le versement a déjà été effectué.</li>
        <li>Veuillez saisir correctement les informations de votre compte de retrait ; toute information incorrecte entraînera l'échec du retrait.</li>
        <li>Le montant demandé doit être disponible sur votre solde. Il est réservé pendant le traitement et libéré si la demande est refusée.</li>
      </ol>
      <div className="np-rule" />
      <p>Retrait minimum : 2 300 FCFA. Frais : 20 %. Horaires : de 09 h à 18 h, heure du Maroc. Un VIP actif et un solde disponible suffisant sont nécessaires. Consultez l’historique pour suivre votre demande.</p>
      <button className="np-unavailable" type="button" disabled aria-disabled="true">Historique des retraits · indisponible dans l’aperçu</button>
    </section>
  </div></SuitePage>;
}

export default Withdraw;

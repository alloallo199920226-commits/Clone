import { useEffect, useState } from "react";
import "./_group.css";

const preview = "/__mockup/preview/payment-clear";
const images = "/__mockup/images/narke-payment/";

export function Success() {
  const [english, setEnglish] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const update = () => setClock(new Intl.DateTimeFormat(english ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [english]);

  return (
    <main className="pc">
      <div className="pc-shell">
        <div className="pc-topline" />
        <header className="pc-brandrow">
          <img className="pc-logo" src={`${images}narke-project-logo.png`} alt="NARKE Industries" />
          <div className="pc-tools"><time aria-label={english ? "Local time" : "Heure locale"}>{clock}</time><button className="pc-language" type="button" onClick={() => setEnglish(!english)} aria-label={english ? "Passer en français" : "Switch to English"}>{english ? "FR" : "EN"}</button></div>
        </header>
        <p className="pc-kicker">{english ? "Payment result" : "Résultat du paiement"}</p>
        <section className="pc-result" data-state="success" role="status" aria-live="polite" aria-atomic="true">
          <div className="pc-result-icon" aria-hidden="true">✓</div>
          <h1>{english ? "Payment confirmed" : "Paiement confirmé"}</h1>
          <p className="pc-result-copy">{english ? "The operator confirmed the transaction and your account has been credited." : "L’opérateur a confirmé la transaction et votre compte a été crédité."}</p>
          <dl className="pc-meta">
            <dt>{english ? "Status" : "Statut"}</dt><dd>{english ? "Credited" : "Crédité"}</dd>
            <dt>{english ? "Amount" : "Montant"}</dt><dd>3 500 FCFA</dd>
            <dt>{english ? "Demo number" : "Numéro démo"}</dt><dd>+226 70 •• •• 56</dd>
            <dt>{english ? "Demo reference" : "Référence démo"}</dt><dd>DEMO-3500</dd>
          </dl>
        </section>
        <p className="pc-next">{english ? "You’re ready for the next ride." : "Votre prochaine sortie vous attend."}</p>
        <p className="pc-subtitle">{english ? "Keep the demo reference for your records." : "Conservez cette référence de démonstration."}</p>
        <div className="pc-actions">
          <a className="pc-link" href={`${preview}/Payment`}>{english ? "Make another demo top-up" : "Faire une autre recharge démo"} <span aria-hidden="true">→</span></a>
          <a className="pc-secondary" href={`${preview}/Pending`}>{english ? "View payment tracking" : "Voir le suivi du paiement"}</a>
        </div>
        <img className="pc-foot-art" src={`${images}narke-recharge-hero.jpg`} alt="" />
        <p className="pc-demo">Maquette · données fictives</p>
      </div>
    </main>
  );
}

export default Success;

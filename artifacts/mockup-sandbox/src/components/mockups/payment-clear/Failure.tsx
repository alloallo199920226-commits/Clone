import { useEffect, useState } from "react";
import "./_group.css";

const preview = "/__mockup/preview/payment-clear";
const images = "/__mockup/images/narke-payment/";

export function Failure() {
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
        <section className="pc-result" data-state="failure" role="alert" aria-live="assertive" aria-atomic="true">
          <div className="pc-result-icon" aria-hidden="true">!</div>
          <h1>{english ? "Payment not confirmed" : "Paiement non confirmé"}</h1>
          <p className="pc-result-copy">{english ? "The operator returned a terminal failure for this request. We cannot confirm whether your wallet was debited." : "L’opérateur a signalé un échec définitif pour cette demande. Nous ne pouvons pas confirmer si votre portefeuille a été débité."}</p>
          <dl className="pc-meta">
            <dt>{english ? "Status" : "Statut"}</dt><dd>{english ? "Not confirmed" : "Non confirmé"}</dd>
            <dt>{english ? "Amount" : "Montant"}</dt><dd>3 500 FCFA</dd>
            <dt>{english ? "Demo number" : "Numéro démo"}</dt><dd>+226 70 •• •• 56</dd>
            <dt>{english ? "Demo reference" : "Référence démo"}</dt><dd>DEMO-3500</dd>
          </dl>
        </section>
        <p className="pc-next">{english ? "Before trying again" : "Avant toute nouvelle tentative"}</p>
        <p className="pc-subtitle">{english ? "Check your operator account or contact their support first. Do not repeat the payment until you know whether a debit occurred." : "Vérifiez d’abord votre compte opérateur ou contactez son assistance. Ne répétez pas le paiement avant de savoir si un débit a eu lieu."}</p>
        <div className="pc-actions">
          <a className="pc-link" href={`${preview}/Pending`}>{english ? "Review payment status" : "Revoir le statut du paiement"} <span aria-hidden="true">→</span></a>
          <a className="pc-secondary" href={`${preview}/Payment`}>{english ? "Return to payment details" : "Revenir aux informations de paiement"}</a>
        </div>
        <img className="pc-foot-art" src={`${images}narke-waterline.webp`} alt="" />
        <p className="pc-demo">Maquette · données fictives</p>
      </div>
    </main>
  );
}

export default Failure;

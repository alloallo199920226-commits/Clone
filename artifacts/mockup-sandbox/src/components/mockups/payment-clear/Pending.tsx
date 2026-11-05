import { useEffect, useState } from "react";
import "./_group.css";

const preview = "/__mockup/preview/payment-clear";
const images = "/__mockup/images/narke-payment/";

export function Pending() {
  const [english, setEnglish] = useState(false);
  const [clock, setClock] = useState("");
  const [checked, setChecked] = useState(false);

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
        <p className="pc-kicker">{english ? "Payment tracking" : "Suivi du paiement"}</p>
        <section className="pc-result" data-state="pending" role="status" aria-live="polite" aria-atomic="true">
          <div className="pc-result-icon" aria-hidden="true">…</div>
          <h1>{english ? "Still awaiting confirmation" : "Confirmation en attente"}</h1>
          <p className="pc-result-copy">{checked
            ? (english ? "The payment is still pending. No new payment was started." : "Le paiement est toujours en attente. Aucun nouveau paiement n’a été lancé.")
            : (english ? "Your operator has not confirmed the result yet. This does not mean the payment failed." : "Votre opérateur n’a pas encore confirmé le résultat. Cela ne signifie pas que le paiement a échoué.")}</p>
          <dl className="pc-meta">
            <dt>{english ? "Status" : "Statut"}</dt><dd>{english ? "Pending" : "En attente"}</dd>
            <dt>{english ? "Amount" : "Montant"}</dt><dd>3 500 FCFA</dd>
            <dt>{english ? "Demo number" : "Numéro démo"}</dt><dd>+226 70 •• •• 56</dd>
            <dt>{english ? "Demo reference" : "Référence démo"}</dt><dd>DEMO-3500</dd>
          </dl>
        </section>
        <p className="pc-next">{english ? "What to do now" : "À faire maintenant"}</p>
        <p className="pc-subtitle">{english ? "Check your operator’s message or account. Please do not submit another payment while this one is uncertain." : "Vérifiez le message ou le compte de votre opérateur. Ne relancez pas de paiement tant que celui-ci reste incertain."}</p>
        <div className="pc-actions">
          <button className="pc-link" type="button" onClick={() => setChecked(true)}>{english ? "Check status again" : "Vérifier à nouveau"} <span aria-hidden="true">↻</span></button>
          <a className="pc-secondary" href={`${preview}/Payment`}>{english ? "Back to payment details" : "Revenir aux informations de paiement"}</a>
        </div>
        <img className="pc-foot-art" src={`${images}narke-waterline.webp`} alt="" />
        <p className="pc-demo">Maquette · données fictives</p>
      </div>
    </main>
  );
}

export default Pending;

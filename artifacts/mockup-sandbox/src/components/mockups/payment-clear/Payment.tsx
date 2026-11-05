import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./_group.css";

const preview = "/__mockup/preview/payment-clear";
const images = "/__mockup/images/narke-payment/";
const operators = [
  { id: "orange", name: "Orange Money", mark: "OM" },
  { id: "moov", name: "Moov Money", mark: "MM" },
  { id: "telecel", name: "Telecel Cash", mark: "TC" },
];

export function Payment() {
  const [operator, setOperator] = useState("orange");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [english, setEnglish] = useState(false);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const update = () => setClock(new Intl.DateTimeFormat(english ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [english]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) {
      setError(english ? "Enter a valid Burkina Faso mobile number." : "Veuillez saisir un numéro mobile du Burkina Faso valide.");
      return;
    }
    if (operator === "orange" && otp && !/^\d{4,12}$/.test(otp)) {
      setError(english ? "The temporary code must contain 4 to 12 digits." : "Le code temporaire doit contenir de 4 à 12 chiffres.");
      return;
    }
    window.location.href = `${preview}/Pending`;
  };

  return (
    <main className="pc">
      <div className="pc-shell">
        <div className="pc-topline" />
        <header className="pc-brandrow">
          <img className="pc-logo" src={`${images}narke-project-logo.png`} alt="NARKE Industries" />
          <div className="pc-tools">
            <time aria-label={english ? "Local time" : "Heure locale"}>{clock}</time>
            <button className="pc-language" type="button" onClick={() => setEnglish(!english)} aria-label={english ? "Passer en français" : "Switch to English"}>{english ? "FR" : "EN"}</button>
          </div>
        </header>

        <p className="pc-kicker">{english ? "Automatic top-up" : "Recharge automatique"}</p>
        <h1>{english ? "Choose your payment" : "Choisissez votre paiement"}</h1>
        <p className="pc-subtitle">{english ? "Mobile Money · Burkina Faso" : "Mobile Money · Burkina Faso"}</p>

        <div className="pc-amount" aria-label={english ? "Selected amount" : "Montant sélectionné"}>
          <span>{english ? "Amount to pay" : "Montant à payer"}</span>
          <strong>3 500 FCFA</strong>
        </div>

        <form onSubmit={submit} noValidate>
          <h2 className="pc-section-title" id="operator-title">{english ? "Payment operator" : "Opérateur de paiement"}</h2>
          <div className="pc-operators" role="group" aria-labelledby="operator-title">
            {operators.map((item) => (
              <button key={item.id} className="pc-operator" type="button" aria-pressed={operator === item.id} onClick={() => { setOperator(item.id); setError(""); }}>
                <span className="pc-operator-main"><span className="pc-operator-mark" aria-hidden="true">{item.mark}</span><span className="pc-operator-name">{item.name}</span></span>
                <span className="pc-check" aria-hidden="true">✓</span>
              </button>
            ))}
          </div>

          <label className="pc-field-label" htmlFor="pc-phone">{english ? "Mobile Money number" : "Numéro Mobile Money"}</label>
          <div className="pc-phonewrap">
            <span className="pc-country" aria-label={english ? "Burkina Faso" : "Burkina Faso"}>BF</span>
            <span className="pc-prefix" aria-hidden="true">+226</span>
            <input id="pc-phone" className="pc-phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="70 12 34 56" value={phone} onChange={(event) => { setPhone(event.target.value); setError(""); }} aria-describedby="pc-phone-hint pc-error" required />
          </div>
          <p className="pc-hint" id="pc-phone-hint">{english ? "Use the number linked to your selected wallet." : "Utilisez le numéro associé au portefeuille choisi."}</p>

          {operator === "orange" && (
            <details className="pc-disclosure">
              <summary>{english ? "Need help with the temporary code?" : "Besoin d’aide pour le code temporaire ?"}</summary>
              <div className="pc-code-help">
                <p>{english ? "Dial this USSD code with your Orange line to receive a temporary operator code:" : "Composez ce code USSD depuis votre ligne Orange pour recevoir un code temporaire de l’opérateur :"}</p>
                <code className="pc-ussd">*144*4*6*3500#</code>
                <label className="pc-field-label" htmlFor="pc-otp" style={{ marginTop: 12 }}>{english ? "Temporary operator code (not your PIN)" : "Code temporaire de l’opérateur (pas votre PIN)"}</label>
                <input id="pc-otp" className="pc-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={12} pattern="[0-9]{4,12}" placeholder={english ? "Enter the code if requested" : "Saisissez le code s’il est demandé"} value={otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, "")); setError(""); }} aria-describedby="pc-otp-hint" />
                <p className="pc-hint" id="pc-otp-hint">{english ? "This is not your Mobile Money PIN. Never enter your PIN here." : "Ce code n’est pas votre PIN Mobile Money. Ne saisissez jamais votre PIN ici."}</p>
              </div>
            </details>
          )}

          {error && <p id="pc-error" role="alert" className="pc-hint" style={{ color: "#8a5b19", marginBottom: 12 }}>{error}</p>}
          <button className="pc-submit" type="submit">{english ? "Continue to payment" : "Continuer le paiement"} <span aria-hidden="true">→</span></button>
        </form>

        <p className="pc-safe"><span className="pc-safe-mark" aria-hidden="true">i</span><span>{english ? "Confirm only with your operator. This demo never sends a payment." : "Confirmez uniquement auprès de votre opérateur. Cette maquette n’envoie aucun paiement."}</span></p>
        <div className="pc-image-note"><img src={`${images}narke-project-header.jpg`} alt="" /><span>{english ? "A clearer way back to the water." : "Le chemin le plus simple vers l’eau."}</span></div>
        <p className="pc-demo">Maquette · données fictives</p>
      </div>
    </main>
  );
}

export default Payment;

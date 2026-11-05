import { useRef, useState, type FormEvent } from "react";
import "./_group.css";
import "./Narke.css";
import "./Signup.css";

const countries: [string, string][] = [
  ["+228", "Togo"],
  ["+225", "Côte d’Ivoire"],
  ["+229", "Bénin"],
  ["+226", "Burkina Faso"],
  ["+227", "Niger"],
  ["+237", "Cameroun"],
];

export function Signup() {
  const [country, setCountry] = useState<[string, string] | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [referral, setReferral] = useState(() => new URLSearchParams(window.location.search).get("c") || "");
  const [notice, setNotice] = useState("");
  const confirmationRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!country) {
      setNotice("Sélectionnez votre pays pour continuer.");
      document.getElementById("signup-country")?.focus();
      return;
    }
    if (confirmationRef.current && passwordRef.current) {
      confirmationRef.current.setCustomValidity(
        confirmationRef.current.value !== passwordRef.current.value
          ? "Les mots de passe ne correspondent pas."
          : "",
      );
    }
    if (!form.reportValidity()) return;
    setNotice("Aperçu uniquement — aucune inscription n’a été envoyée.");
  }

  function updatePasswordMatch() {
    if (confirmationRef.current && passwordRef.current) {
      confirmationRef.current.setCustomValidity(
        confirmationRef.current.value && confirmationRef.current.value !== passwordRef.current.value
          ? "Les mots de passe ne correspondent pas."
          : "",
      );
    }
  }

  return (
    <div className="narke-preview">
      <main className="narke-page narke-signup-page">
        <div className="narke-hero-art">
          <img className="narke-hero-image" src="/__mockup/images/narke-hero-reference.png" alt="NARKE Industries — fabricant de jet-ski électrique" />
        </div>
        <section className="narke-auth-card narke-signup-card" aria-labelledby="signup-title">
          <h1 id="signup-title">Créer votre compte</h1>
          <p className="narke-subtitle">Rejoignez l’univers Narke Industries</p>
          <form className="narke-signup-form" data-auth-form="signup" onSubmit={handleSubmit}>
            <label className="narke-sr-only" htmlFor="signup-country">Pays</label>
            <span className="narke-sr-only" id="signup-country-loading">Ouvrir la sélection des pays</span>
            <button className="narke-field narke-country-trigger" id="signup-country" type="button" aria-haspopup="dialog" aria-controls="signup-country-dialog" aria-describedby="signup-country-loading" aria-expanded={countryOpen} onClick={() => setCountryOpen(true)}>
              <span className="narke-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.8"/><path d="M3.5 12h17M12 3.2c2.2 2.4 3.2 5.3 3.2 8.8s-1 6.4-3.2 8.8C9.8 18.4 8.8 15.5 8.8 12s1-6.4 3.2-8.8Z"/></svg>
              </span>
              <span className="narke-country-label" data-country-label>{country ? `${country[1]} (${country[0]})` : "Sélectionnez votre pays"}</span>
              <svg className="narke-dropdown-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 7 6 6 6-6"/></svg>
            </button>
            <input type="hidden" name="country" value={country?.[0] ?? ""} required />

            <label className="narke-sr-only" htmlFor="signup-phone">Numéro de portable</label>
            <div className="narke-field narke-phone-field">
              <span className="narke-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M7.2 3.8 9.8 7l-1.7 2.5a15.3 15.3 0 0 0 6.4 6.4l2.5-1.7 3.2 2.6-.8 3.2c-.2.8-1 1.3-1.8 1.2C9.8 20 4 14.2 2.8 6.4c-.1-.8.4-1.6 1.2-1.8l3.2-.8Z"/></svg>
              </span>
              {country && <span className="narke-phone-prefix" data-phone-prefix aria-hidden="true">{country[0]}</span>}
              <input className="narke-phone-input" id="signup-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Votre numéro de téléphone" required />
            </div>

            <label className="narke-sr-only" htmlFor="signup-password">Mot de passe</label>
            <div className="narke-field narke-password-field">
              <span className="narke-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="4.3" y="10" width="15.4" height="11" rx="1.8"/><path d="M7.7 10V7.4a4.3 4.3 0 0 1 8.6 0V10M12 14v3"/></svg>
              </span>
              <input ref={passwordRef} className="narke-signup-password-input" id="signup-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Mot de passe de connexion" aria-describedby="signup-password-hint" minLength={8} required onChange={updatePasswordMatch} />
              <button className="narke-password-toggle" type="button" data-password-toggle aria-pressed={showPassword} aria-controls="signup-password" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} onClick={() => setShowPassword(value => !value)}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/>{!showPassword && <path d="m4 4 16 16"/>}</svg>
              </button>
            </div>
            <span className="narke-sr-only" id="signup-password-hint">8 caractères minimum</span>

            <label className="narke-sr-only" htmlFor="signup-confirm">Répéter le mot de passe</label>
            <div className="narke-field narke-password-field">
              <span className="narke-field-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><rect x="4.3" y="10" width="15.4" height="11" rx="1.8"/><path d="M7.7 10V7.4a4.3 4.3 0 0 1 8.6 0V10M12 14v3"/></svg>
              </span>
              <input ref={confirmationRef} className="narke-signup-password-input" id="signup-confirm" name="password-confirm" type={showConfirmation ? "text" : "password"} autoComplete="new-password" placeholder="Répéter le mot de passe" minLength={8} required onChange={updatePasswordMatch} />
              <button className="narke-password-toggle" type="button" data-password-toggle aria-pressed={showConfirmation} aria-controls="signup-confirm" aria-label={showConfirmation ? "Masquer la confirmation du mot de passe" : "Afficher la confirmation du mot de passe"} onClick={() => setShowConfirmation(value => !value)}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/>{!showConfirmation && <path d="m4 4 16 16"/>}</svg>
              </button>
            </div>

            <label className="narke-sr-only" htmlFor="signup-referral">Code de parrainage (facultatif)</label>
            <input className="field narke-signup-referral" id="signup-referral" name="referral_code" type="text" autoComplete="off" placeholder="Code de parrainage (facultatif)" minLength={6} maxLength={10} pattern="[A-Za-z0-9]{6,10}" value={referral} onChange={event => setReferral(event.target.value)} />

            <button className="narke-primary-button" type="submit">
              <span>Créer mon compte</span>
              <span className="narke-submit-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12h14m-6-6 6 6-6 6"/></svg></span>
            </button>
            <div className="narke-form-divider" aria-hidden="true"><span /><b>ou</b><span /></div>
            <p className="narke-switch-copy">Déjà inscrit ? <a href="/connexion">Connectez-vous</a></p>
          </form>
          <p className="narke-demo-notice" role="status" aria-live="polite">{notice}</p>
        </section>
      </main>

      {countryOpen && (
        <div className="narke-country-overlay" data-country-overlay onClick={() => setCountryOpen(false)}>
          <section className="narke-country-sheet" id="signup-country-dialog" role="dialog" aria-modal="true" aria-labelledby="signup-country-title" onClick={event => event.stopPropagation()}>
            <header className="narke-sheet-header">
              <button className="narke-sheet-back" type="button" aria-label="Fermer" onClick={() => setCountryOpen(false)}>‹</button>
              <h2 id="signup-country-title">Sélectionnez votre pays</h2>
              <span />
            </header>
            <div className="narke-country-options">
              {countries.map(option => (
                <button className="narke-country-option" type="button" key={option[0]} onClick={() => { setCountry(option); setCountryOpen(false); setNotice(""); }}>
                  <span>{option[0]}</span><span>{option[1]}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import './_group.css';

const root = '/__mockup/preview/payment-ocean';
const assets = '/__mockup/images/narke-payment/';

type OceanPageProps = { children: ReactNode; title: string };

export function OceanPage({ children, title }: OceanPageProps) {
  const [localTime, setLocalTime] = useState(() => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
  useEffect(() => {
    const update = () => setLocalTime(new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <main className="ocean-pay">
      <div className="ocean-pay__shell">
        <div className="ocean-pay__topline">
          <div className="ocean-pay__brand">
            <img src={`${assets}narke-project-logo.png`} alt="NARKE Industries" />
            <div className="ocean-pay__brand-copy">
              <span className="ocean-pay__brand-caption">Recharge sécurisée</span>
            </div>
          </div>
          <div className="ocean-pay__tools">
            <span className="ocean-pay__locale" aria-label="Langue française">FR</span>
            <time className="ocean-pay__clock" aria-label={`Heure locale : ${localTime}`}>{localTime}</time>
            <span className="ocean-pay__demo">Maquette · données fictives</span>
          </div>
        </div>
        <div className="ocean-pay__hero">
          <img className="ocean-pay__hero-image" src={`${assets}narke-recharge-hero.jpg`} alt="Jet-ski NARKE sur l’eau" />
          <div className="ocean-pay__hero-copy">
            <span className="ocean-pay__eyebrow">NARKE Industries · Burkina Faso</span>
            <h1>{title}</h1>
          </div>
        </div>
        {children}
        <footer className="ocean-pay__footer">Expérience de démonstration · Aucun paiement n’est envoyé.</footer>
      </div>
    </main>
  );
}

export function AmountSummary({ caption = 'Recharge de votre espace NARKE' }: { caption?: string }) {
  return (
    <div className="ocean-pay__amount" aria-label="Montant de la recharge">
      <div>
        <span className="ocean-pay__amount-label">Montant de la recharge</span>
        <span className="ocean-pay__amount-note">{caption}</span>
      </div>
      <strong>3 500 <small>FCFA</small></strong>
    </div>
  );
}

export function PaymentForm() {
  const [operator, setOperator] = useState('orange');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [notice, setNotice] = useState('');

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[0-9+()\s-]{8,20}$/.test(phone.trim())) {
      setNotice('Vérifiez le numéro de téléphone avant de continuer.');
      return;
    }
    if (operator === 'orange' && otp && !/^\d{4,12}$/.test(otp)) {
      setNotice('Le code temporaire doit contenir de 4 à 12 chiffres.');
      return;
    }
    window.location.assign(`${root}/Pending?operator=${encodeURIComponent(operator)}`);
  };

  return (
    <form className="ocean-pay__form" onSubmit={onSubmit} noValidate>
      <p className="ocean-pay__section-label">Votre portefeuille Mobile Money</p>
      <div className="ocean-pay__operators" role="radiogroup" aria-label="Opérateur de paiement">
        {[
          ['orange', 'Orange Money'],
          ['moov', 'Moov Money'],
          ['telecel', 'Telecel Cash'],
        ].map(([value, label]) => (
          <div className="ocean-pay__operator" key={value}>
            <input id={`ocean-${value}`} type="radio" name="operator" value={value} checked={operator === value} onChange={() => { setOperator(value); setNotice(''); }} />
            <label htmlFor={`ocean-${value}`}>{label}</label>
          </div>
        ))}
      </div>

      <label className="ocean-pay__field" htmlFor="ocean-phone">Numéro de téléphone</label>
      <div className="ocean-pay__phone-wrap">
        <span className="ocean-pay__country" aria-label="Burkina Faso, indicatif +226">BF&nbsp; +226</span>
        <input id="ocean-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Votre numéro" value={phone} onChange={(event) => { setPhone(event.target.value); setNotice(''); }} required aria-describedby="ocean-phone-hint" />
      </div>
      <p id="ocean-phone-hint" className="ocean-pay__hint">Le numéro associé au portefeuille choisi.</p>

      {operator === 'orange' && (
        <section className="ocean-pay__otp" aria-labelledby="ocean-otp-label">
          <label className="ocean-pay__field" id="ocean-otp-label" htmlFor="ocean-otp">Code temporaire de l’opérateur</label>
          <p>Ce code n’est pas votre PIN. Le code temporaire, s’il est demandé, est distinct du code USSD ci-dessous.</p>
          <input id="ocean-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={12} pattern="[0-9]{4,12}" placeholder="Code temporaire (facultatif)" value={otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 12)); setNotice(''); }} aria-describedby="ocean-otp-help" />
          <span id="ocean-otp-help" className="ocean-pay__hint">Ne saisissez jamais votre code PIN Mobile Money sur cette page.</span>
        </section>
      )}

      {operator === 'orange' && (
        <div className="ocean-pay__ussd" aria-label="Code USSD Orange Money">
          <span className="ocean-pay__ussd-mark" aria-hidden="true">↗</span>
          <div>
            <strong>Code USSD opérateur</strong>
            <code>*144*4*6*3500#</code>
            <small>Composez ce code depuis votre téléphone si votre opérateur le demande.</small>
          </div>
        </div>
      )}
      <p className="ocean-pay__safety">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" aria-hidden="true"><path d="M12 2.8 19 5.4v5.3c0 4.3-2.8 7.8-7 10.4-4.2-2.6-7-6.1-7-10.4V5.4l7-2.6Z"/><path d="m9 12 2 2 4-4"/></svg>
        Validez uniquement auprès de votre opérateur. Votre PIN ne doit jamais être communiqué.
      </p>
      <button className="ocean-pay__submit" type="submit"><span>Continuer vers le suivi</span><span aria-hidden="true">→</span></button>
      <p className="ocean-pay__hint" aria-live="polite" role={notice ? 'alert' : 'status'}>{notice}</p>
    </form>
  );
}

type ResultKind = 'pending' | 'success' | 'failure';
type ResultProps = {
  kind: ResultKind;
  title: string;
  lead: string;
  children?: ReactNode;
  notice?: ReactNode;
  demoPaths?: boolean;
};

export function ResultPanel({ kind, title, lead, children, notice, demoPaths = false }: ResultProps) {
  const operatorKey = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('operator');
  const operatorName = operatorKey === 'moov' ? 'Moov Money' : operatorKey === 'telecel' ? 'Telecel Cash' : 'Orange Money';
  const symbol = kind === 'success'
    ? <svg viewBox="0 0 32 32"><path d="m7 16 6 6L25 10" /></svg>
    : kind === 'failure'
      ? <svg viewBox="0 0 32 32"><path d="M16 9v8m0 5h.01" /><path d="M16 3.5 29 27H3L16 3.5Z" /></svg>
      : <svg viewBox="0 0 32 32"><path d="M16 8v8l5 3" /><circle cx="16" cy="16" r="12" /></svg>;
  return (
    <section className="ocean-pay__content" aria-live="polite">
      <div className="ocean-pay__result">
        <div className="ocean-pay__result-head">
          {kind === 'pending' && <span className="ocean-pay__status-badge"><i /> Demande transmise · confirmation en cours</span>}
          <div className={`ocean-pay__result-symbol ocean-pay__result-symbol--${kind}`} aria-hidden="true">{symbol}</div>
          <p className="ocean-pay__result-kicker">{kind === 'success' ? 'Reçu de recharge' : kind === 'failure' ? 'Statut de la demande' : 'Vérification opérateur'}</p>
          <h1>{title}</h1>
          <p className="ocean-pay__result-lead">{lead}</p>
        </div>
        <div className="ocean-pay__result-value">
          <span>Montant de la demande · données de démonstration</span>
          <strong>3 500 FCFA</strong>
        </div>
        <div className="ocean-pay__receipt" aria-label="Détails de la demande">
          <div className="ocean-pay__receipt-row"><span>Référence DEMO</span><strong><code>DEMO-NK-3500-042</code></strong></div>
          <div className="ocean-pay__receipt-row"><span>Opérateur</span><strong>{operatorName}</strong></div>
          <div className="ocean-pay__receipt-row"><span>Numéro</span><strong>+226 •• •• 42 18</strong></div>
          <div className="ocean-pay__receipt-row"><span>État</span><strong>{kind === 'success' ? 'Crédit confirmé · démo' : kind === 'failure' ? 'Échec terminal · démo' : 'Toujours en attente · démo'}</strong></div>
        </div>
        {notice && <div className={`ocean-pay__notice${kind === 'failure' ? ' ocean-pay__notice--caution' : ''}`}>{notice}</div>}
        {children}
        {demoPaths && (
          <div className="ocean-pay__demo-paths">
            <p className="ocean-pay__demo-label">Autres écrans de démonstration</p>
            <div className="ocean-pay__demo-links">
              <a href={`${root}/Success`}>Crédit confirmé</a>
              <a href={`${root}/Failure`}>Échec terminal</a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function ResultActions({ primaryLabel = 'Revenir à la recharge', primaryTo = 'Payment', secondaryLabel = 'Voir le suivi en attente', secondaryTo = 'Pending' }: { primaryLabel?: string; primaryTo?: string; secondaryLabel?: string; secondaryTo?: string }) {
  return (
    <nav className="ocean-pay__actions" aria-label="Navigation de démonstration">
      <a className="ocean-pay__button ocean-pay__button--primary" href={`${root}/${primaryTo}`}>{primaryLabel}</a>
      <a className="ocean-pay__button" href={`${root}/${secondaryTo}`}>{secondaryLabel}</a>
    </nav>
  );
}

export function PendingRefresh() {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <button className="ocean-pay__button" type="button" onClick={() => setChecked(true)}>
        {checked ? 'Toujours en attente' : 'Actualiser le statut'}
      </button>
      {checked && <p className="ocean-pay__hint" role="status">État de démonstration inchangé. Aucune vérification réseau n’a été envoyée.</p>}
    </>
  );
}

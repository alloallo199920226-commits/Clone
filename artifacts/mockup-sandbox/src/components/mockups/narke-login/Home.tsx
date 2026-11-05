import { useState } from "react";
import "./_group.css";
import "./Home.css";

type Model = {
  vip: string;
  model: string;
  category: string;
  image: string;
  daily: string;
  badge?: "Premium" | "Elite";
};

const models: Model[] = [
  { vip: "VIP1", model: "NK-S300", category: "Sport Électrique", image: "narke-model-1.png", daily: "FCFA 4 200" },
  { vip: "VIP2", model: "NK-S500", category: "Performance Pro", image: "narke-model-2.png", daily: "FCFA 7 000", badge: "Premium" },
  { vip: "VIP3", model: "NK-X700", category: "Longue Autonomie", image: "narke-model-3.png", daily: "—" },
  { vip: "VIP4", model: "NK-X900", category: "Haut de Gamme", image: "narke-model-4.png", daily: "—", badge: "Elite" },
  { vip: "VIP5", model: "VIP5", category: "NARKE Industries", image: "narke-model-3.png", daily: "—" },
  { vip: "VIP6", model: "VIP6", category: "NARKE Industries", image: "narke-model-4.png", daily: "—" },
];

const image = (name: string) => `/__mockup/images/${name}`;

export function Home() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [selected, setSelected] = useState<Model | null>(null);

  const slides = ["narke-home-hero.png", "narke-model-1.png", "narke-model-2.png", "narke-model-4.png"];

  return (
    <div className="narke-home">
      <header className="narke-home-header">
        <button className="narke-home-icon" type="button" aria-label="Ouvrir le menu" aria-controls="narke-home-menu" onClick={() => setMenuOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" /></svg>
        </button>
        <a className="narke-home-logo" href="/accueil" aria-label="NARKE Industries — Accueil"><img src={image("narke-home-logo.png")} alt="NARKE Industries" /></a>
        <button className="narke-home-icon narke-home-bell" type="button" aria-label="Notifications" onClick={() => setNoticeOpen(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /><circle cx="19.3" cy="3.9" r="1.5" /></svg>
        </button>
      </header>

      <main className="narke-home-main">
        <section className="narke-home-hero" aria-label="Jet-ski électrique de nouvelle génération">
          <div className="narke-home-hero-copy">
            <p>NARKE INDUSTRIES</p>
            <h1>Jet-ski électrique<br />de nouvelle génération</h1>
            <div className="narke-home-features">
              <span><svg viewBox="0 0 24 24"><path d="m13.2 2-8 11h5l-.8 9 8.2-12h-5.1L13.2 2Z" /></svg><small>100%<br />Électrique</small></span>
              <span><svg viewBox="0 0 24 24"><path d="M4 16a8 8 0 1 1 16 0M12 12l4-4M8 19h8" /></svg><small>Haute<br />Performance</small></span>
              <span><svg viewBox="0 0 24 24"><path d="M20.5 3.5C13 3.5 6 5.2 4 10.5c-1.2 3.3 1 6.2 4.5 6.2 5.7 0 9.5-6.1 12-13.2Z" /><path d="M3.5 21c3.2-5.3 7.1-8.6 12.2-11.7" /></svg><small>Zéro<br />Émission</small></span>
            </div>
            <a className="narke-home-cta" href="#narke-home-catalog">Découvrir <span>→</span></a>
          </div>
          <div className="narke-home-art" aria-hidden="true">
            <img className="narke-home-sky" src={image("narke-home-sky.png")} alt="" />
            {slides.map((slide, index) => <img className={index === activeSlide ? "is-active" : ""} key={slide} src={image(slide)} alt="" />)}
          </div>
          <div className="narke-home-dots" aria-label="Diapositives">
            {slides.map((_, index) => <button key={index} type="button" aria-label={`Diapositive ${index + 1}`} aria-pressed={activeSlide === index} onClick={() => setActiveSlide(index)} />)}
          </div>
        </section>

        <section className="narke-home-quick" aria-label="Actions rapides">
          <a href="/recharger"><svg viewBox="0 0 24 24"><path d="M4.5 7.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" /><path d="M5 7.5V5a2 2 0 0 1 2-2h10M8 12h6m-3-3v6m7-2h.01" /></svg><span>Recharger</span></a>
          <a href="/retrait"><svg viewBox="0 0 24 24"><path d="M19.5 7.5h-13a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z" /><path d="M19 7.5V5a2 2 0 0 0-2-2H7m9 9-3 3m0 0-3-3m3 3V9" /></svg><span>Retirer</span></a>
          <a href="/service-client"><svg viewBox="0 0 24 24"><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12H3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2V12Zm16 0h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2V12Zm0 7c0 2-2 3-5 3" /></svg><span>Service client</span></a>
        </section>

        <section className="narke-home-catalog" id="narke-home-catalog">
          <div className="narke-home-catalog-head"><h2>Nos modèles</h2><button type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>Voir tout <span>{showAll ? "−" : "→"}</span></button></div>
          <div className="narke-home-grid">
            {models.slice(0, showAll ? 6 : 4).map((model) => (
              <article className="narke-home-card" key={model.vip}>
                <div className="narke-home-card-title">
                  <div><h3>{model.model}</h3><p>{model.category}</p></div>
                  {model.badge && <span className={`narke-home-badge ${model.badge === "Elite" ? "elite" : ""}`}><BadgeIcon type={model.badge} />{model.badge}</span>}
                </div>
                <div className="narke-home-model-image"><img src={image(model.image)} alt={`NARKE ${model.model}, ${model.category}`} /></div>
                <div className="narke-home-metrics"><strong>{model.daily}</strong><span>Revenu quotidien · donnée de référence</span><strong>—</strong><span>Revenu total</span></div>
                <div className="narke-home-buy"><div><b>FCFA —</b><small>Prix du modèle</small></div><button type="button" onClick={() => setSelected(model)}><span data-buy-label>Acheter</span><span aria-hidden="true">→</span></button></div>
              </article>
            ))}
          </div>
          <p className="narke-home-reference-note">Aperçu de conception · données quotidiennes visibles pour les deux premiers modèles uniquement ; aucun tarif d’achat n’est simulé.</p>
        </section>
      </main>

      <nav className="narke-home-bottom" aria-label="Navigation principale">
        <a className="active" href="/accueil" aria-current="page"><NavIcon type="home" /><span>Accueil</span></a>
        <a href="/projet"><NavIcon type="projects" /><span>Projets</span></a>
        <a href="/equipe"><NavIcon type="team" /><span>Équipe</span></a>
        <a href="/compte"><NavIcon type="account" /><span>Mon compte</span></a>
      </nav>

      {menuOpen && <div className="narke-home-overlay" onMouseDown={() => setMenuOpen(false)}>
        <section className="narke-home-menu" id="narke-home-menu" role="dialog" aria-modal="true" aria-label="Menu principal" onMouseDown={event => event.stopPropagation()}>
          <header><span>NARKE <small>INDUSTRIES</small></span><button type="button" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)}>×</button></header>
          <nav>{[["Accueil", "/accueil"], ["Mes produits", "/projet"], ["Recharger", "/recharger"], ["Retirer", "/retrait"], ["Équipe", "/equipe"], ["Mon compte", "/compte"], ["Notifications", "/notifications"], ["Service client", "/service-client"]].map(([label, href], index) => <a href={href} key={href}>{label}<span>{String(index + 1).padStart(2, "0")}</span></a>)}</nav>
          <p>ÉLECTRIQUE. SANS COMPROMIS.</p>
        </section>
      </div>}
      {(selected || noticeOpen) && <div className="narke-home-overlay" onMouseDown={() => { setSelected(null); setNoticeOpen(false); }}>
        <section className="narke-home-dialog" role="dialog" aria-modal="true" aria-labelledby="narke-home-dialog-title" onMouseDown={event => event.stopPropagation()}>
          <button className="narke-home-dialog-close" type="button" aria-label="Fermer" onClick={() => { setSelected(null); setNoticeOpen(false); }}>×</button>
          {selected ? <>
            <p className="narke-home-dialog-kicker">APERÇU DE CONCEPTION</p><h2 id="narke-home-dialog-title">{selected.model}</h2>
            <div className="narke-home-dialog-model"><img src={image(selected.image)} alt="" /><div><b>Prix du modèle : FCFA —</b><span>{selected.daily === "—" ? "Revenu quotidien : —" : `${selected.daily} / jour · donnée visuelle de référence`}</span><span>Revenu total : —</span><span>Durée : —</span></div></div>
            <p className="narke-home-dialog-note">Aucune opération d’achat ou de paiement n’est possible dans cette prévisualisation.</p>
          </> : <><p className="narke-home-dialog-kicker">NARKE INDUSTRIES</p><h2 id="narke-home-dialog-title">Notifications</h2><p className="narke-home-dialog-note">Les notifications du compte apparaîtront ici dans l’application.</p></>}
          <button className="narke-home-dialog-ok" type="button" onClick={() => { setSelected(null); setNoticeOpen(false); }}>Fermer l’aperçu</button>
        </section>
      </div>}
    </div>
  );
}

function BadgeIcon({ type }: { type: "Premium" | "Elite" }) {
  return type === "Premium"
    ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m2 11 1-7 4 4 2-5 2 5 3-4 1 7H2Zm1 2h10" /></svg>
    : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1 6 7-6 7-6-7 6-7Z" /><path d="m2 8 6 2 6-2" /></svg>;
}

function NavIcon({ type }: { type: "home" | "projects" | "team" | "account" }) {
  if (type === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V10Z" /></svg>;
  if (type === "projects") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2.5 12h11l2-8H6" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></svg>;
  if (type === "team") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.5 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.1l6.2-.9L12 2.5Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4" /><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2h-15Z" /></svg>;
}

export default Home;

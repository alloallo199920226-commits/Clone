import "./_group.css";
import { SampleLabel, SuitePage } from "./NarkeShell";

const contacts = [
  { label: "Telegram · Service client", detail: "Contact de service client", href: "https://t.me/Ivecoservice", type: "telegram" },
  { label: "Chaîne WhatsApp", detail: "Actualités et informations", href: "https://whatsapp.com/channel/0029Vb908sVDZ4LVfxtZJA1r", type: "whatsapp" },
  { label: "Groupe Telegram", detail: "Communauté NARKE", href: "https://t.me/+jYx8aX3eSwozNmQ0", type: "telegram" },
];

export function Support() {
  return <SuitePage title="Service client" back="/compte"><div className="np-content">
    <SampleLabel />
    <section className="np-support-hero">
      <span className="np-eyebrow">NARKE INDUSTRIES</span>
      <h2>Service<br /><em>client</em></h2>
      <p>Notre équipe est à votre écoute pour toute question, assistance ou demande d’information.</p>
    </section>
    <section className="np-card np-hours"><span className="np-headset" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 13v-1a9 9 0 0 1 18 0v1M3 13h4v7H5a2 2 0 0 1-2-2v-5ZM21 13h-4v7h2a2 2 0 0 0 2-2v-5Z" /></svg></span><strong>9:00 – 19:00</strong><span>Horaires du service client</span><img src="/__mockup/images/narke-suite-model-1.webp" alt="" /></section>
    <div className="np-contact-list">{contacts.map((contact, index) => <a className={`np-card np-contact contact-${index + 1}`} href={contact.href} target="_blank" rel="noopener noreferrer" key={contact.label}>
      <span className={`np-contact-icon ${contact.type}`} aria-hidden="true">{contact.type === "whatsapp" ? <svg viewBox="0 0 24 24"><path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.1A8.5 8.5 0 1 1 20 11.5Z" /><path d="M8 8.2c.5 2.6 2.1 4.2 4.7 4.8l1-1 2 .9c-.1 1.3-.9 2-2.1 2-3.4-.3-6.7-3.6-7-7 .1-1.2.7-2 2-2.1l.9 2Z" /></svg> : <svg viewBox="0 0 24 24"><path d="m3 11 18-8-6 18-4-7-8-3Zm8 3 4-5" /></svg>}</span>
      <span><strong>{contact.label}</strong><small>{contact.detail}</small></span>
       <img src={`/__mockup/images/narke-suite-model-${index === 1 ? 3 : index === 2 ? 2 : 1}.webp`} alt="" />
      <b aria-hidden="true">›</b>
    </a>)}</div>
  </div></SuitePage>;
}

export default Support;

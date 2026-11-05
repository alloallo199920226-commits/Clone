import { useState, type ReactNode } from "react";

const routes: Record<string, string> = {
  "/accueil": "/__mockup/preview/narke-suite/Account",
  "/projet": "/__mockup/preview/narke-suite/Account",
  "/equipe": "/__mockup/preview/narke-suite/Team",
  "/mon-equipe": "/__mockup/preview/narke-suite/TeamDetail",
  "/compte": "/__mockup/preview/narke-suite/Account",
  "/missions": "/__mockup/preview/narke-suite/Missions",
  "/retrait": "/__mockup/preview/narke-suite/Withdraw",
  "/service-client": "/__mockup/preview/narke-suite/Support",
  "/historique-recharges": "/__mockup/preview/narke-suite/Deposits",
};
const localHref = (path: string) => routes[path] ?? "/__mockup/preview/narke-suite/Account";
const links = [
  ["Maison", "/accueil"],
  ["Projet", "/projet"],
  ["Équipe", "/equipe"],
  ["Mon compte", "/compte"],
  ["Missions", "/missions"],
];

export function SuiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="np-header">
      <button type="button" aria-label={open ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      <img src="/__mockup/images/narke-home-logo.png" alt="NARKE Industries" />
      <a href={localHref("/compte")} aria-label="Notifications"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></a>
      {open && <nav className="np-menu" aria-label="Menu principal">{links.map(([label, href]) => <a key={href} href={localHref(href)}>{label}</a>)}</nav>}
    </header>
  );
}

export function SuiteNav({ active }: { active: string }) {
  const nav = [
    ["Maison", "/compte", <path key="p" d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10" />],
    ["Projet", "/compte", <path key="p" d="M4 5h16l-2 10H7L4 5ZM4 5 3 2H1M8 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />],
    ["Équipe", "/equipe", <path key="p" d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8" />],
    ["Mon compte", "/compte", <path key="p" d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />],
  ];
  return <nav className="np-bottom" aria-label="Navigation principale">{nav.map(([label, href, icon]) => <a key={label as string} href={localHref(href as string)} aria-current={active === label ? "page" : undefined}><svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>{label}</a>)}</nav>;
}

export function SuitePage({ title, back = "/compte", children, active = "", showTitle = true }: { title: string; back?: string; children: ReactNode; active?: string; showTitle?: boolean }) {
  return <div className="narke-preview"><main className="np-shell"><SuiteHeader />{showTitle && <div className="np-titlebar"><a className="np-back" href={localHref(back)} aria-label="Retour">‹</a><h1>{title}</h1><span /></div>}{children}{active && <SuiteNav active={active} />}</main></div>;
}

export function SampleLabel() {
  return <span className="np-sample">Aperçu — données illustratives</span>;
}

export function Glyph({ name }: { name: "coins" | "history" | "withdraw" | "wallet" | "gift" | "info" | "rules" | "service" | "logout" | "team" | "link" }) {
  const paths: Record<typeof name, string> = {
    coins: "M4 7c0-2 3-3 6-3s6 1 6 3-3 3-6 3-6-1-6-3Zm0 0v5c0 2 3 3 6 3m0-8v10c0 2 3 3 6 3s6-1 6-3V9m-12 3c0 2 3 3 6 3s6-1 6-3",
    history: "M4 5h16v15H4zM8 9h8M8 13h8M8 17h5",
    withdraw: "M4 12h13m-5-5 5 5-5 5M5 4h7M5 20h7",
    wallet: "M3 6h18v14H3zM3 9h18m-6 5h3",
    gift: "M3 9h18v4H3zM5 13v8h14v-8M12 9v12m0-12H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z",
    info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-10h.01",
    rules: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
    service: "M3 13v-1a9 9 0 0 1 18 0v1M3 13h4v7H5a2 2 0 0 1-2-2v-5ZM21 13h-4v7h2a2 2 0 0 0 2-2v-5Z",
    logout: "M10 4H4v16h6m3-4 4-4-4-4m-4 4h8",
    team: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
    link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2m3 6a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  };
  return <svg className="np-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}

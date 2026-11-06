/* Additive adapter. Original administration scripts remain byte-identical. */
(() => {
  const nav = document.querySelector("#general-admin-nav");
  if (!nav) return;
  const escape = v => String(v ?? "Non renseigné").replace(/[&<>"']/g,
    c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = v => v == null ? "Non renseigné" : `${Number(v).toLocaleString("fr-FR")} FCFA`;
  const date = v => v ? new Date(v).toLocaleString("fr-FR", {timeZone:"Africa/Casablanca"}) : "Non renseignée";
  const names = {commission:"Commission de parrainage",recharge:"Dépôt crédité",withdrawal:"Retrait enregistré",
    purchase:"Achat VIP",income:"Revenu de produit",bonus:"Bonus / ajustement"};
  const field = (label, value) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
  const card = t => {
    const d = t.details || {};
    let fields = field("Compte bénéficiaire", `${t.phone} · #${t.user_id}`)
      + field("Date de l’écriture (Maroc)", date(t.created_at))
      + field("Référence de l’écriture", t.provider_reference);
    if (t.kind === "commission") {
      fields += field("Filleul à l’origine du dépôt", t.source_phone
        ? `${t.source_phone} · #${t.source_user_id}` : "Source historique non retrouvée")
        + field("Niveau de parrainage", d.level) + field("Montant déposé par le filleul", money(t.deposit_amount))
        + field("Taux appliqué", d.rate_percent == null ? null : `${d.rate_percent} %`)
        + field("Base de calcul enregistrée", money(d.base_amount_fcfa))
        + field("Déclencheur", "Premier dépôt approuvé du filleul");
    }
    if (t.deposit_id) {
      fields += field("Dépôt source", `#${t.deposit_id}`)
        + field("Référence du paiement source", t.deposit_reference)
        + field("Validation", t.approval_method === "automatic" ? "Automatique · prestataire vérifié" : "Manuelle · administration")
        + field("Approbateur", t.approved_console ? "Console administrateur" : t.approved_by ? `Administrateur #${t.approved_by}` : t.approval_method === "automatic" ? "Système" : "Non renseigné")
        + field("Dépôt approuvé le (Maroc)", date(t.approved_at));
      if (t.payment_order_id) fields += field("Demande de paiement", t.payment_order_id)
        + field("Opérateur", t.operator_id) + field("Numéro payeur", t.payer_phone)
        + field("État prestataire enregistré", t.provider_status === "successful" ? "Réussi" : t.provider_status)
        + field("Paiement initié le (Maroc)", date(t.initiated_at))
        + field("Dernière vérification (Maroc)", date(t.checked_at))
        + field("Crédit enregistré le (Maroc)", date(t.credited_at));
    }
    if (t.kind === "withdrawal") fields += field("Compte de réception", d.destination)
      + field("Titulaire", d.receiver_name) + field("Opérateur", d.channel)
      + field("Frais", money(d.fee_fcfa)) + field("Montant net", money(d.net_amount_fcfa))
      + field("Demande créée le (Maroc)", date(t.requested_at))
      + field("Décision enregistrée le (Maroc)", date(t.reviewed_at))
      + field("Traitement", "Écriture d’un retrait approuvé ; ne constitue pas un reçu de versement du prestataire.");
    if (t.kind === "purchase") fields += field("Produit", d.product_name || t.label)
      + field("Quantité", d.quantity) + field("Durée", d.validity_days == null ? null : `${d.validity_days} jours`)
      + field("Revenu journalier contractuel", money(d.daily_income_fcfa))
      + field("Revenu total contractuel", money(d.total_income_fcfa)) + field("Identifiant de demande", d.request_id);
    if (t.kind === "income") fields += field("Achat source", t.purchase_id ? `#${t.purchase_id} · ${t.purchase_name}` : "Achat historique non retrouvé")
      + field("Achat effectué le (Maroc)", date(t.purchased_at))
      + field("Période versée", d.period) + field("Échéance prévue (Maroc)", date(d.due_at));
    if (t.kind === "bonus") fields += field("Origine", d.admin_type === "admin_credit" ? "Crédit administrateur"
      : d.admin_type === "admin_debit" ? "Débit administrateur"
      : d.policy === "welcome" ? "Bonus de bienvenue · ce n’est pas un dépôt réel" : t.label)
      + field("Auteur administratif", d.admin_type ? (d.admin_id ? `Administrateur #${d.admin_id}` : "Console administrateur") : "Sans objet")
      + field("Référence de la demande", d.request_id || t.provider_reference);
    return `<article class="trace-card"><h3>${escape(names[t.kind] || t.label)} <strong>${t.amount_fcfa > 0 ? "+" : ""}${escape(money(t.amount_fcfa))}</strong></h3>
      <p>${escape(t.label)} · Écriture #${escape(t.id)}</p><dl>${fields}</dl>
      ${t.kind === "commission" ? '<p class="trace-note">L’inscription, les bonus et l’achat VIP ne déclenchent pas cette commission.</p>' : ""}</article>`;
  };
  let activeDialog;
  const open = uid => {
    if (activeDialog) { activeDialog.close(); activeDialog.remove(); }
    const dialog = document.createElement("dialog");
    activeDialog = dialog;
    dialog.className = "admin-trace-dialog";
    dialog.innerHTML = `<header><div><small>NARKE · ADMINISTRATION</small><h2>Traçabilité des transactions</h2></div><button type="button" data-trace-close aria-label="Fermer">×</button></header>
      <p>Origine des écritures comptables créditées ou débitées. Les demandes en attente ou refusées restent dans Transactions. Les états prestataire sont ceux enregistrés lors du traitement, sans nouvelle vérification en direct.</p>
      <form class="trace-filters"><label>Compte utilisateur<input name="user" inputmode="numeric" placeholder="Identifiant du compte" value="${escape(uid || "")}"></label>
      <label>Type<select name="kind"><option value="all">Tous les types</option>${Object.entries(names).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></label>
      <label>Rechercher<input name="search" placeholder="Téléphone, filleul ou référence"></label><button>Rechercher</button></form>
      <p role="status" data-trace-status></p><div data-trace-results></div>
      <footer><button type="button" data-trace-prev>Précédent</button><button type="button" data-trace-next>Suivant</button></footer>`;
    document.body.append(dialog);
    dialog.showModal();
    const form = dialog.querySelector("form"), status = dialog.querySelector("[data-trace-status]");
    const prev = dialog.querySelector("[data-trace-prev]"), next = dialog.querySelector("[data-trace-next]");
    let offset = 0, nextCursor = null, version = 0;
    const load = async () => {
      const request = ++version;
      prev.disabled = next.disabled = true;
      status.textContent = "Chargement de la traçabilité…";
      dialog.querySelector("[data-trace-results]").replaceChildren();
      try {
        const params = new URLSearchParams(new FormData(form));
        params.set("cursor", offset);
        const response = await fetch("/api/admin/transaction-trace?" + params, {credentials:"same-origin",cache:"no-store"});
        const data = await response.json();
        if (request !== version || !dialog.isConnected) return;
        if (!response.ok) throw Error(data.error || data.message || "Lecture impossible.");
        nextCursor = data.nextCursor;
        status.textContent = `${data.total} écriture(s) · heures du Maroc`;
        dialog.querySelector("[data-trace-results]").innerHTML = data.transactions.map(card).join("") || "<p>Aucune écriture pour ces filtres.</p>";
        prev.disabled = offset === 0; next.disabled = !nextCursor;
      } catch (error) {
        if (request === version) status.textContent = error.message;
      }
    };
    form.addEventListener("submit", event => { event.preventDefault(); offset = 0; load(); });
    prev.onclick = () => { offset = Math.max(0, offset-30); load(); };
    next.onclick = () => { if(nextCursor) { offset = Number(nextCursor); load(); } };
    dialog.querySelector("[data-trace-close]").onclick = () => { dialog.close(); dialog.remove(); };
    dialog.addEventListener("close", () => { ++version; dialog.remove(); if(activeDialog===dialog) activeDialog=null; });
    load();
  };
  const button = document.createElement("button");
  button.type = "button"; button.dataset.transactionTrace = "all"; button.textContent = "Traçabilité";
  button.onclick = () => open();
  nav.append(button);
  let selectedUser;
  document.addEventListener("click", event => {
    const row = event.target.closest("[data-user]");
    if (row) selectedUser = row.dataset.user;
  }, true);
  new MutationObserver(() => {
    const panel = document.querySelector(".admin-user-panel");
    if (!panel || panel.querySelector("[data-user-trace]") || !selectedUser) return;
    const uid = selectedUser;
    const detail = document.createElement("button");
    detail.type = "button"; detail.dataset.userTrace = uid;
    detail.textContent = "Voir toute la traçabilité de ce compte";
    detail.onclick = () => open(uid);
    panel.prepend(detail);
  }).observe(document.body, {childList:true,subtree:true});
  document.querySelector("#logout")?.addEventListener("click", () => activeDialog?.close());
})();

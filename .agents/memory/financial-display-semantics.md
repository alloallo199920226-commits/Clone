---
name: Financial display semantics
description: Preserve the difference between settled funds, pending requests, purchases, and actual earnings.
---

Masquer les références de paiement dans les historiques et confirmations clients,
sans créer de fausses références ni supprimer les identifiants réels côté serveur
ou dans l’administration. Afficher uniquement un numéro numérique de présentation,
nommé « N° d’affichage », calculé côté frontend et non envoyé au backend.

**Why:** l’utilisateur a demandé de cacher les références visibles ; leur suppression
visuelle ne rend pas un paiement intraçable et ne doit pas être présentée comme telle.

**How to apply:** conserver les liens de suivi, les rapprochements, l’idempotence et
les preuves de paiement ; ne pas réintroduire les références ou boutons de copie
sur ces écrans clients. Le numéro d’affichage n’est pas une référence officielle,
une preuve de paiement ou une mesure empêchant la traçabilité.

Keep pending deposit/withdrawal requests separate from the settled financial ledger.
A pending request must not change the settled balance or appear as a verified payment;
a withdrawal reservation does reduce the spendable balance.

Les demandes de retrait manuel nécessitent au moins un VIP actif, acheté ou octroyé.
Minimum : 2 300 FCFA ; frais : 20 % ; horaires : 10 h à 18 h, heure du Maroc.
Le solde disponible exclut les réservations en
attente, sans les représenter comme des versements déjà effectués.

**Why:** l’utilisateur a précisé le minimum, les frais et les horaires après avoir
demandé la condition de VIP actif.

**How to apply:** utiliser le fuseau Africa/Casablanca, pas un décalage UTC fixe.
Accepter les nouvelles demandes à partir de 10 h et les fermer à 18 h.
Conserver les frais des demandes déjà enregistrées ; sérialiser les dépenses
et réserver les demandes en attente. L’approbation administrative signifie que le
versement manuel a été effectué ; le refus libère la réservation. Le VIP doit être
actif au dépôt de la demande, pas simplement présent dans l’historique.

**Why:** the supplied history references include pending deposits, but the balance is calculated from the ledger. Treating a pending request as a ledger entry would misrepresent funds received.

**How to apply:** a future manual-payment flow needs separate request storage and an explicit verification/approval step before a settled entry is recorded.

For manual payments, clicking the result button must immediately declare the deposit to
the administration, show a small spinner, then return home after ten seconds.
The acknowledgement describes a recorded request, not verified receipt of money.

**Why:** the user requested immediate administration recording and a ten-second return;
elapsed time or a customer click cannot prove that the merchant received a transfer.

**How to apply:** preserve idempotency across retries, never announce success on a failed
save, and keep administrative approval separate from the customer acknowledgement.

Dans « Mon équipe », le montant à droite de chaque filleul représente ses dépôts validés cumulés, pas ses achats VIP. Les montants en haut représentent les commissions du parrain par niveau.

**Why:** l’utilisateur attend de voir « le montant déposé par les investisseurs » dans cette colonne ; un achat VIP et un dépôt ne sont pas interchangeables.

**How to apply:** conserver cette distinction lors des modifications de l’équipe ; exclure les bonus, crédits administratifs et demandes non validées des dépôts affichés.

Purchase cost is not earned income. Withdrawal net amounts and product earnings must come from verified stored facts, not calculations based on advertised percentages or screenshot values.

**Why:** the reference has separate purchase-price, earned-income, and amount-received figures; silently calculating one from another would present unsupported financial information.

**How to apply:** display unknown financial facts as “—”. Report per-level commissions only when settled commissions can actually be attributed to members at those levels; do not distribute an unallocated total using advertised rates.

Deposit recipient details will come from the administrator. Screenshot recipient information is not configuration.

**Why:** the user clarified: “les information viendras de ladmin toi tu doit juste reproduire la maquette”.

**How to apply:** reproduce the deposit screens and their navigation without requesting or inventing merchant details for the maquette. Keep recipient information explicitly unconfigured until supplied through administration.

Once the administrator has configured active payment channels, customers expect
those channels and recipient details to appear for their account's country.

**Why:** the user reported that a configured Bénin payment method was missing from
the customer page; fixed demonstration operators are not a substitute for saved configuration.

**How to apply:** use the administrator's active channels as the source of truth.
Displaying merchant instructions does not confirm payment or authorize automatic credits.

The deposit countdown represents the validity of the current entry session, not a bank or operator payment deadline.

**Why:** the user requested a working timer while payment-provider and recipient configuration remain separate work.

**How to apply:** elapsed time may expire the entry flow, but must never approve, reject, debit or credit a financial transaction. If a provider is integrated later, its verified transaction status remains authoritative.

Les codes cadeaux sont des autorisations de bonus que le propriétaire génère
depuis l’administration. L’utilisateur demande un ajout réel au solde, pas un
effet visuel ni une simulation de paiement. Le montant vient de l’administration.

**Why:** l’utilisateur a répété sa demande de saisie de codes cadeaux pour gagner
des bonus directement sur le solde.

**How to apply:** préserver cette provenance administrative ; ne pas traiter un
bonus cadeau comme un dépôt Mobile Money ou comme un premier dépôt de parrainage.

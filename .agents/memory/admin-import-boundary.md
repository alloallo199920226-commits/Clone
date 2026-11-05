---
name: Administration import boundary
description: Preserve the supplied administration JavaScript without replacing the customer application.
---

The user requested that the supplied administration JavaScript remain exactly unchanged.
Integrate its interface with the existing application, rather than replacing the customer
site with the unrelated server included in the source bundle.

**Why:** the supplied server changes identities, branding and financial defaults. The
user supplied the archive to complete the administration dependencies, not to authorize
replacing existing accounts or changing the previously requested financial rules.

**How to apply:** verify the served administration JavaScript against the original archive.
Keep compatibility changes outside that script, preserve existing accounts, and obtain
an explicit decision before activating additional financial services or changing policy.

When preserving an imported client exactly, verify its actual browser requests as well
as direct API tests. A successful API test alone does not prove wire compatibility.

Pour changer l’identité visuelle de la console, contrôler aussi les couleurs
calculées et le rendu connecté après le chargement de toutes les feuilles importées.
Un test fonctionnel réussi ne prouve pas que l’ancien thème a disparu.

**Why:** un thème fourni par l’archive reprenait la priorité sur le nouvel habillage :
les actions fonctionnaient, mais des surfaces anciennes rendaient le texte illisible.

**How to apply:** conserver les scripts importés, isoler la présentation dans
l’adaptateur et vérifier le contraste réel des en-têtes, onglets et montants.

**Why:** the source bundle's history script sends HTML-escaped query separators, and
its logout sends no JSON body. Rewriting that JavaScript would break the user's
explicit source-preservation requirement.

**How to apply:** make narrow, validated server-side compatibility adaptations and
keep browser checks for search filtering, pagination and console logout.

L’utilisateur a choisi une connexion administrateur indépendante des comptes clients :
lien personnalisé et mot de passe administrateur dédié. Ne plus exiger d’autorisation
sur un compte client pour ouvrir la console.

**Why:** the user explicitly confirmed this replacement of the earlier account-linked
flow after being blocked by customer-account authorization.

**How to apply:** require the dedicated console password and a valid console session on
every administration operation. The private URL alone never grants access. Do not create
or promote a customer to represent the owner; retain auditing of the independent principal.

Les retraits des utilisateurs ayant reçu un crédit administrateur **ou un octroi de VIP**
doivent figurer dans « Crédit admin », jamais dans les retraits normaux.
Un VIP acheté par le client ne constitue pas un octroi administratif.

**Why:** l’utilisateur demande explicitement de ne pas mélanger ces deux catégories.

**How to apply:** classer selon l’historique des aides reçues, pas uniquement le solde
actuel ou les VIP encore actifs. Fournir les deux motifs à l’interface existante.
Cette règle de classement n’autorise pas à activer les demandes ou les paiements de retrait.

Les retraits encore en attente des acheteurs de VIP du jour doivent être affichés
à part, dans « VIP achetés aujourd’hui ». Les commissions du jour ont leur propre
onglet. La date est celle du Maroc.

**Why:** après la vue regroupée, l’utilisateur a demandé d’afficher entièrement
à part les retraits en attente des utilisateurs ayant acheté un VIP aujourd’hui.

**How to apply:** inclure aussi les demandes plus anciennes toujours en attente ;
ne pas compter les VIP offerts comme achats, ne pas dupliquer les demandes et
conserver le classement existant entre retraits normaux et crédit admin ailleurs.
Un utilisateur remplissant les deux critères peut figurer dans les deux onglets,
sans dupliquer sa demande dans un même onglet ni autoriser un double traitement.

Les commandes administratives « Ouvrir », « Fermer » et « Horaire normal »
contrôlent les nouvelles demandes de retrait, pas les versements. L’ouverture
manuelle ignore uniquement l’horaire ; elle conserve le VIP actif, le minimum,
les frais, le solde disponible et les restrictions individuelles.
L’horaire normal est de 09 h à 18 h, heure du Maroc. La fermeture à 18 h
est impérative, y compris en mode d’ouverture manuelle.

**Why:** l’utilisateur a signalé que l’ouverture manuelle depuis la console était
bloquée ; il veut utiliser cette commande sans changer la politique financière.

**How to apply:** conserver l’état entre redémarrages et répliques, protéger chaque
changement par la session administrateur et ne jamais approuver ou envoyer un
retrait lors d’un changement d’horaire. Adapter les anciens libellés de la console
sans modifier son JavaScript importé.

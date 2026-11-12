---
name: Reference fidelity
description: User expectations for faithful screen reproduction and meaningful visual checks.
---

Reproduce the user’s supplied screen composition and text closely rather than substituting a different interface.

La nouvelle référence de connexion utilise Zoomc E-Bike, son vélo et son
ambiance rouge/bleu, uniquement pour la page de connexion.

**Why:** l’utilisateur a demandé de refaire cette page exactement selon sa
capture Zoomc, avec adaptation mobile ; cette demande ne remplace pas la marque
ni les écrans NARKE du reste de la plateforme.

**How to apply:** conserver la connexion téléphone/pays/mot de passe réelle,
sans inventer des profils de connexion à partir du libellé de la maquette.

La reconstruction NARKE concerne la connexion, l’inscription, l’accueil et les
écrans clients de retrait, service, historique, compte, missions et équipe,
sans modifier l’administration ni les règles financières existantes.

**Why:** le protocole fourni demande une reconstruction visuelle tout en
conservant l’authentification et les données ; l’utilisateur a explicitement
rappelé l’inscription puis fourni des références distinctes pour l’accueil
et les sept écrans de gestion du compte et de l’équipe.
Les montants du catalogue administré priment sur les exemples de la capture.

**How to apply:** garder les vrais champs et la connexion serveur ; distinguer
l’aperçu Design (sans authentification) du formulaire réel. Ne pas annoncer une
égalité parfaite des pixels ni une validation Safari native à partir de Chromium.

**Why:** the user repeatedly pointed out that the delivered notification and account screens did not match their references.

**How to apply:** compare the actual opened notification and signed-in account view to the supplied images. A screenshot of the closed selector or sign-in page does not verify an interactive or authenticated screen. Describe exactly which states were checked; do not imply iPhone Safari or published-site verification from a development Chromium check.

Clipboard checks in headless Chromium need a focused page and a user-gesture context, not just clipboard permissions.

**Why:** programmatically clicking the real copy button without that context failed despite granted permissions; the focused user-gesture check successfully wrote and read the clipboard.

**How to apply:** exercise genuine clipboard access with focus and a user gesture before diagnosing the interface as broken; do not replace the clipboard with a stub to claim the copy interaction works.

Ground delegated edits in the existing route map, and verify them through the actual signed-in URL, not merely by checking that new files exist.

**Why:** similarly spelled imported directories and output-directory prefixes caused reference markup to be written somewhere other than the page served to users.

**How to apply:** resolve the live route to its current source before delegating, preserve that path, and confirm the rendered route after integration.

Use real photos of attractive modern vehicles, not screenshots as image backgrounds. Keep phone numbers and balances account-specific, never copied from a reference image.

**Why:** the user explicitly requested vehicle photos rather than screenshots and real platform data. Some imported remote images that appeared vehicle-related actually contained entire UI captures or unrelated vehicle models.

**How to apply:** inspect the rendered asset itself and compare the vehicle to the reference, rather than trusting a filename or VIP label. Match layout without presenting reference financial figures as real funds or activated returns.

Pour l’encadré de transfert manuel sans USSD, reprendre uniquement l’instruction
demandée par l’utilisateur : copier le numéro de réception, payer via le répertoire
ou Mobile Money, revenir cliquer sur « Obtenir le résultat », puis la mention
« Votre compte est crédité en moins de 5 mn ». Ne pas rallonger cet encadré avec
des explications sur la vérification administrative ou un délai indicatif.

**Why:** l’utilisateur a répété sa demande de reprendre exactement son instruction,
sans les précisions ajoutées par l’agent.

**How to apply:** cette consigne concerne la copie de cet encadré ; ne pas changer
la validation réelle du dépôt ni simuler une réussite de paiement.

Les nouveaux écrans clients référencés NARKE utilisent les jet-skis des captures
fournies, et non les anciens camions IVECO ou des véhicules génériques.

**Why:** la demande de reconstruction NARKE remplace l’ancienne direction IVECO
pour ces écrans et impose de conserver l’orientation et les couleurs des visuels.

**How to apply:** extraire uniquement les illustrations, sans texte ni contrôles
intégrés ; ne jamais utiliser une capture complète comme fond de page.

Le parcours de paiement doit conserver la direction approuvée « C · Immersif
NARKE » pour le formulaire, l’attente, la réussite et l’échec : scène marine
immersive sombre et surface de paiement claire, et non une carte entièrement
sombre.

**Why:** l’utilisateur a choisi explicitement ce même modèle pour les quatre
étapes, après comparaison des trois directions sur le canevas.

**How to apply:** garder cette direction lors des évolutions du paiement ;
les variantes de démonstration ne remplacent jamais les états réels confirmés
par le serveur.

Les étapes du paiement automatique doivent tenir à l’écran sans défilement,
avec les vrais logos des moyens de paiement dès la sélection.

**Why:** après intégration de la direction immersive, l’utilisateur a demandé
explicitement des étapes non défilables et a refusé les moyens de paiement
représentés seulement par du texte.

**How to apply:** la compacité prime sur la hauteur décorative de la maquette ;
conserver les actions accessibles sur petit écran, y compris pour le code
temporaire et les messages de connexion interrompue, sans masquer un contrôle
par un simple débordement coupé.

Verify brand identity in downloaded logos, not just the search result name.

**Why:** searches for Moov Africa returned unrelated Moov Inc. assets, and MTN results mixed older multicolor marks with the requested black/yellow mark.

**How to apply:** inspect each logo image before using it and retain its source URL. An administrator-supplied logo remains authoritative.

La page « À propos de nous » doit avoir une identité visuelle distincte de celle
des Règles, mais garder le fond bleu nuit et cyan du site, avec des textes clairs
opaques. Ne pas utiliser de fond blanc pour cette page.

**Why:** l’utilisateur a demandé de différencier ces pages, puis a explicitement
rejeté le fond clair et demandé de reprendre l’arrière-plan du site.

**How to apply:** ne pas réutiliser la présentation du règlement à l’identique
pour la présentation de la plateforme ; conserver un contenu fidèle au catalogue
numérique, sans inventer une vente physique ou des faits sur l’entreprise.

The country selector must show its states one after another and follow the real Internet connection, not just run a fast fixed animation. The user describes the first indicator as resembling a pulley, not a circle.

**Why:** the user repeated that the first loader’s geometry was wrong and that the stages advanced too quickly without following their connection.

**How to apply:** preserve the reference panel and loader geometry, wait for actual server responses before advancing, and provide an explicit retry state on connection failure. Short minimum display times may make each stage visible on fast networks, but must never advance a pending request.

Authentication submission must show the centered three orange dots from the supplied reference, then open the home page only when authentication and the session are actually confirmed.

**Why:** the user requested that this indicator appear before site access and that the transition follow the real network quality rather than a preset delay.

**How to apply:** keep the indicator visible during pending network work, prevent duplicate submissions, and restore the form with an explicit error on failure. Do not turn the loader into an unconditional timed redirect.

Internal page links must show the full-screen light-gray loading view with the centered blue segmented indicator. Navigation bars are explicitly excluded.

**Why:** the user requested this loading view whenever they click a page in the site, “sauf les navbar”.

**How to apply:** retain the separate authentication and country-picker indicators. Follow actual page, data and image loading rather than a fake success delay; keep navbar navigation free of the full-screen loader.

Vérifier l’ouverture d’une page en cliquant sur son lien réel depuis le compte,
en complément de l’accès direct à son URL.

**Why:** les contrôles directs de la page « À propos » avaient réussi, mais ils
contournaient l’état de navigation qui bloquait les utilisateurs derrière le chargeur.

**How to apply:** tester la transition réelle, le retour et les ressources différées
ou indisponibles, pas seulement le contenu de la destination déjà ouverte.

Les zones de saisie du site doivent rester sans contours ni halos colorés et ne pas
déclencher de zoom automatique sur Safari.

**Why:** l’utilisateur a demandé de corriger ce comportement partout sur le site,
après avoir montré le champ téléphone sur iPhone.

**How to apply:** conserver un texte de saisie d’au moins 16 pixels et le zoom
manuel accessible. Indiquer le focus clavier sans contour, et distinguer les
décorations du site des éléments natifs du clavier Safari.

La page Équipe doit conserver une section visible pour parcourir les filleuls
des niveaux 1, 2 et 3, avec leurs numéros masqués, ainsi qu’un accès clair au détail.

**Why:** l’utilisateur a signalé que cette consultation avait disparu après la
reconstruction visuelle.

**How to apply:** ne pas masquer cet accès pendant une refonte ; vérifier les
trois onglets, les listes réelles et l’état vide depuis la page Équipe.

Les contrôles visuels doivent vérifier la géométrie et la visibilité des données,
pas seulement leur présence dans le DOM.

**Why:** les éléments natifs `<details>` distribuent leur contenu dans un arbre
interne du navigateur ; leur appliquer une grille comme à un conteneur ordinaire
a produit des cartes démesurées alors que les assertions de texte réussissaient.

**How to apply:** garder la grille sur un conteneur ordinaire et le contrôle
natif à l’intérieur ; mesurer les cartes et les lignes visibles, puis examiner
une capture authentifiée avant de valider une reconstruction.

Les tests du formulaire de paiement doivent fournir un brouillon de recharge
valide et exiger au moins un champ visible avant de mesurer son contraste.

**Why:** une visite sans brouillon affichait seulement l’état « informations
indisponibles » ; le test de lisibilité réussissait sans examiner le téléphone.

**How to apply:** préparer les données de navigation sans initier de paiement,
puis contrôler le texte réellement saisi et sa couleur de remplissage.

Le catalogue doit fonctionner sans les API récentes facultatives du navigateur,
notamment AbortSignal.timeout.

**Why:** son absence sur certains navigateurs empêche même le départ du GET et
laisse tous les prix vides avec les achats désactivés ; cela a été reproduit en
retirant cette API dans un test navigateur, sans panne du serveur.

**How to apply:** utiliser une annulation compatible, tester les API manquantes
et la reprise après erreur réseau. Ne jamais remplacer des tarifs indisponibles
par des valeurs financières inventées ou anciennes.

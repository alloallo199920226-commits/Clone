# NARKE — plateforme membre

## Identité visuelle

L’ensemble des pages servies utilise l’identité NARKE : univers marin, fond bleu
nuit, accents cyan et textes contrastés. Les identifiants historiques de base de
données, cookies, clés de stockage et références de paiement restent inchangés
pour préserver les comptes, sessions et garanties contre les doubles opérations.
Les destinations de contact existantes restent valables, même si leur pseudonyme
historique comporte un ancien nom de marque.

## Lancement

- Cliquez sur Run pour démarrer le workflow `Start application`.
- Commande : `python3 server.py`.
- Le serveur écoute sur `0.0.0.0:5000`.
- La dépendance PostgreSQL du serveur est déclarée dans `pyproject.toml`.
- Le serveur utilise la base PostgreSQL Replit configurée dans l'environnement ; il ne journalise pas sa chaîne de connexion.
- `schema.sql` est la source du schéma des comptes, sessions, parrainages, portefeuilles et transactions. Les anciennes simulations restent conservées séparément et ne sont jamais utilisées dans les soldes ou historiques.

## Pages

- `/` : connexion (page d’entrée)
- `/accueil` : accueil du site, accessible après connexion
- `/projet` : produits
- `/equipe` : parrainage
- `/compte` : compte
- `/notifications` : notifications
- `/connexion` : connexion par numéro de téléphone et mot de passe
- `/inscription` : création d’un compte avec numéro de téléphone et mot de passe
- `/financement` : registre des opérations réelles du compte
- `/recharger` : dépôt automatique au Bénin et au Togo, suivi par confirmation serveur
- `/retrait` : retraits non activés
- `/historique-recharges` et `/historique-retraits` : historiques réels, avec état vide lorsqu’il n’y a aucune opération
- `/gestion-compte-bancaire` et `/ajouter-compte-retrait` : portefeuilles persistants avec nom du titulaire
- `/mon-equipe` : membres invités par niveau, avec numéros masqués
- `/a-propos`, `/regles` et `/service-client` : pages d’information et d’assistance

Les pages du site et les API privées exigent une session. Les mots de passe sont
hachés ; les sessions sont aléatoires, stockées sous forme de hachage et expirent
après un jour, ou sept jours si l’utilisateur choisit de rester connecté. Les
données d’activité sont isolées par compte.

## Limites

Les comptes, parrainages et portefeuilles sont persistants. Les dépôts automatiques
sont limités au Bénin et au Togo. Le Togo utilise T-Money (Togocom) et
Moov Money Togo (Flooz), avec un numéro local de huit chiffres (+228).
Le Burkina Faso utilise les canaux manuels actifs configurés dans l’administration.
Les anciennes demandes automatiques burkinabè restent consultables et vérifiables,
mais aucun nouvel encaissement automatique n’est lancé pour ce pays.
Sur une base existante, appliquer `migrations/sonarapay_togo.sql` avant
d’activer cette extension en production ; aucun changement de schéma au démarrage.
L’authentification fonctionne sans e-mail ni SMS, conformément au parcours demandé.
Les numéros ne sont donc pas vérifiés ; aucun mécanisme de récupération du mot de
passe oublié n’est disponible. Les pages préviennent l’utilisateur de cette limite.
Les soldes et historiques utilisent uniquement le registre des transactions réelles.
Les anciennes simulations sont conservées dans leur table séparée, sans être affichées.
L’utilisateur a autorisé les achats VIP réels sur le solde interne : un achat
enregistre un débit et un produit acquis, sans nouvel encaissement Mobile Money.
Les prix des six produits existants sont vérifiés côté serveur ; les configurations
administratives de même code prennent priorité. Les doubles confirmations d’une
même demande ne doivent jamais provoquer de second débit.
Le service `product_income.py` gère désormais les crédits internes des produits
achetés. Il ne lance aucun transfert Mobile Money.
Le propriétaire connecté à la console dédiée peut toutefois approuver un dépôt
réellement reçu depuis `/administration-depots`. Aucun compte client n’est promu
automatiquement et le lien seul ne suffit jamais à autoriser cette opération.
La page des produits distingue le revenu prévu du revenu effectivement crédité.

## Administration importée

La console `/omarshark-junior-panam` utilise le HTML, les styles et les scripts du ZIP
`attached_assets/aeronova-administration-complete_1792229186027.zip`.
`admin_assets.py` sert exclusivement ses ressources publiques autorisées, sans extraire
ni exécuter son serveur Node. Conserver l’archive dans la publication ; ne pas exposer
le ZIP, ses modules serveur, son dossier migrations ou ses fichiers de configuration.
Le JavaScript `/admin-ui/general.js` doit rester strictement identique à celui du ZIP.
Le HTML charge aussi `/admin-ui/import-compat.css`, une feuille indépendante dans
`pages/admin-import-compat.css` : elle corrige le calcul de largeur avec la barre
latérale et rend les quatorze sections accessibles par défilement horizontal sur mobile,
sans modifier les scripts ni les styles d’origine.

La connexion administrateur est indépendante des comptes clients : le lien personnalisé
affiche directement le formulaire du mot de passe dédié configuré dans le secret
`ADMIN_ACCESS_PASSWORD` (16 à 256 caractères). Le mot de passe client n’ouvre pas
la console. Un secret absent ou trop court bloque l’accès, sans solution de repli.
La session de console expire après dix heures et reste liée au mot de passe
dédié : changer ce dernier invalide les sessions de console
existantes au redémarrage. Après cinq échecs, blocage de quinze minutes.
Aucun compte client n’est créé ou promu pour ouvrir la console. Les opérations
du propriétaire sont identifiées par le principal `dedicated_console` dans l’audit,
sans attribuer ces actions à un client fictif. Les anciennes sessions liées aux clients
ne sont plus acceptées. Le compteur de tentatives utilise le pair réseau réel,
jamais un en-tête fourni par le visiteur ; derrière un proxy partagé, la limite peut
être partagée entre visiteurs.
L’ancien écran `/administration-depots` et son API exigent eux aussi la session
de console ; sans cette session, la page renvoie vers la connexion administrateur.
L’adresse personnalisée a été choisie par l’utilisateur ; l’ancienne adresse
`/administration` renvoie 404. Connaître le lien ne donne aucun droit administrateur.

Les utilisateurs, soldes et historiques viennent des données existantes. Les crédits
et débits sont réels, transactionnels, idempotents et audités. Les produits, codes cadeaux,
canaux et brouillons/annonces sont persistants et séparés des paiements. Une attribution
VIP gratuite n’est ni un achat, ni un dépôt, ni un revenu ; elle ne déclenche aucun
versement automatique. Le blocage/bannissement révoque les sessions existantes.

Les fonctions sans service métier actif (paiements automatiques, ouverture des retraits,
pointage, diffusion des annonces côté client, utilisation des codes cadeaux, blogue et
réception du support) ne sont pas activées par cette importation. Les actions concernées
renvoient une erreur explicite ; aucune donnée de démonstration n’est injectée. Les
paramètres financiers du site restent ceux de sa politique actuelle. La suppression
massive de comptes est désactivée pour préserver les soldes et les historiques.

## Politique financière

- Bonus de bienvenue : 2 300 FCFA, crédité une seule fois à la création d’un nouveau compte.
  Pas de versement rétroactif aux comptes existants.
- Dépôt minimum : 3 500 FCFA. Le seuil de retrait et les prix VIP ne sont pas modifiés.
- Parrainage : 40 % / 2 % / 1 % sur trois niveaux, uniquement sur le premier dépôt
  effectivement approuvé de chaque filleul. Les dépôts suivants ne sont pas commissionnés.
- Les commissions sont calculées en FCFA entiers, arrondies à l’entier inférieur.
- Validation manuelle et future validation automatique vérifiée utilisent le même
  service transactionnel ; références uniques et première recharge sont protégées
  contre les relectures et approbations concurrentes.
- Les anciens dépôts déjà crédités empêchent un nouveau versement de premier dépôt ;
  aucune commission rétroactive n’est créée.
- Une future intégration automatique doit vérifier l’authenticité de l’événement
  prestataire avant d’appeler le service interne ; aucun callback public non vérifié.
La notification s’affiche à chaque navigation vers l’accueil, y compris un retour
par l’historique du navigateur ; sa fermeture n’est pas mémorisée entre les visites.
Tailwind, Google Fonts et les images distantes nécessitent une connexion Internet.

Après une modification de `schema.sql`, le schéma de développement doit être
appliqué avant de tester. Pour que le schéma soit aussi présent en production,
republiez le projet et vérifiez les changements de base de données présentés
dans le parcours de publication.

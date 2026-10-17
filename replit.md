# SHINERAY — projet importé

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
- `/recharger` et `/retrait` : paiements indisponibles tant qu’aucun prestataire n’est connecté
- `/historique-recharges` et `/historique-retraits` : historiques réels, avec état vide lorsqu’il n’y a aucune opération
- `/gestion-compte-bancaire` et `/ajouter-compte-retrait` : portefeuilles persistants avec nom du titulaire
- `/mon-equipe` : membres invités par niveau, avec numéros masqués
- `/a-propos`, `/regles` et `/service-client` : pages d’information et d’assistance

Les pages du site et les API privées exigent une session. Les mots de passe sont
hachés ; les sessions sont aléatoires, stockées sous forme de hachage et expirent
après un jour, ou sept jours si l’utilisateur choisit de rester connecté. Les
données d’activité sont isolées par compte.

## Limites

Les comptes, parrainages et portefeuilles sont persistants. Les paiements automatiques
ne sont pas encore opérationnels.
L’authentification fonctionne sans e-mail ni SMS, conformément au parcours demandé.
Les numéros ne sont donc pas vérifiés ; aucun mécanisme de récupération du mot de
passe oublié n’est disponible. Les pages préviennent l’utilisateur de cette limite.
Les soldes et historiques utilisent uniquement le registre des transactions réelles.
Les anciennes simulations sont conservées dans leur table séparée, sans être affichées.
Aucun prestataire de paiement n’est configuré : les achats et retraits restent
indisponibles, et le parcours de recharge utilisateur reste une maquette.
Un administrateur explicitement autorisé peut toutefois approuver un dépôt réellement
reçu depuis `/administration-depots`, accessible depuis son compte. Aucun compte
n’est promu automatiquement ; le choix de l’administrateur doit venir du propriétaire.
Les tarifs et rendements des produits des captures restent des références non activées.

## Politique financière

- Bonus de bienvenue : 2 300 FCFA, crédité une seule fois à la création d’un nouveau compte.
  Pas de versement rétroactif aux comptes existants.
- Dépôt minimum : 500 FCFA. Le seuil de retrait et les prix VIP ne sont pas modifiés.
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

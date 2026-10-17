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

Les comptes, parrainages et portefeuilles sont persistants. Le service de paiement
n’est pas encore opérationnel.
L’authentification fonctionne sans e-mail ni SMS, conformément au parcours demandé.
Les numéros ne sont donc pas vérifiés ; aucun mécanisme de récupération du mot de
passe oublié n’est disponible. Les pages préviennent l’utilisateur de cette limite.
Les soldes et historiques utilisent uniquement le registre des transactions réelles.
Les anciennes simulations sont conservées dans leur table séparée, sans être affichées.
Aucun prestataire de paiement n’est configuré : aucun achat, recharge ou retrait
ne peut être exécuté. Les tarifs des captures sont des références non activées.
La notification s’affiche à chaque navigation vers l’accueil, y compris un retour
par l’historique du navigateur ; sa fermeture n’est pas mémorisée entre les visites.
Tailwind, Google Fonts et les images distantes nécessitent une connexion Internet.

Après une modification de `schema.sql`, le schéma de développement doit être
appliqué avant de tester. Pour que le schéma soit aussi présent en production,
republiez le projet et vérifiez les changements de base de données présentés
dans le parcours de publication.

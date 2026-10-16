# SHINERAY — projet importé

## Lancement

- Cliquez sur Run pour démarrer le workflow `Start application`.
- Commande : `python3 server.py`.
- Le serveur écoute sur `0.0.0.0:5000`.
- La dépendance PostgreSQL du serveur est déclarée dans `pyproject.toml`.
- Le serveur utilise la base PostgreSQL Replit configurée dans l'environnement ; il ne journalise pas sa chaîne de connexion.
- `schema.sql` est la source du schéma. Il contient les tables des comptes, sessions et activités de démonstration.

## Pages

- `/` : connexion (page d’entrée)
- `/accueil` : accueil du site, accessible après connexion
- `/projet` : produits
- `/equipe` : parrainage
- `/compte` : compte
- `/notifications` : notifications
- `/connexion` : connexion par numéro de téléphone et mot de passe
- `/inscription` : création d’un compte avec numéro de téléphone et mot de passe
- `/financement` : détails du financement (données illustratives)
- `/recharger` et `/retrait` : formulaires de démonstration sans transactions
- `/historique-recharges` et `/historique-retraits` : historiques vides
- `/gestion-compte-bancaire` et `/ajouter-compte-retrait` : gestion fictive des comptes de retrait
- `/a-propos`, `/regles` et `/service-client` : pages d’information et d’assistance

Les pages du site et les API privées exigent une session. Les mots de passe sont
hachés ; les sessions sont aléatoires, stockées sous forme de hachage et expirent
après un jour, ou sept jours si l’utilisateur choisit de rester connecté. Les
données d’activité sont isolées par compte.

## Limites

Il s'agit de maquettes HTML, pas d'un service financier opérationnel.
L’authentification fonctionne sans e-mail ni SMS, conformément au parcours demandé.
Les numéros ne sont donc pas vérifiés ; aucun mécanisme de récupération du mot de
passe oublié n’est disponible. Les pages préviennent l’utilisateur de cette limite.
Les activités d’achat, de recharge et de retrait enregistrées dans le backend sont
explicitement des simulations : elles ne modifient aucun solde et ne transfèrent
pas d’argent. Aucun prestataire de paiement n’est configuré.
Tailwind, Google Fonts et les images distantes nécessitent une connexion Internet.

Après une modification de `schema.sql`, le schéma de développement doit être
appliqué avant de tester. Pour que le schéma soit aussi présent en production,
republiez le projet et vérifiez les changements de base de données présentés
dans le parcours de publication.

# SHINERAY — projet importé

## Lancement

- Cliquez sur Run pour démarrer le workflow `Start application`.
- Commande : `python3 server.py`.
- Le serveur écoute sur `0.0.0.0:5000`.
- Aucune dépendance Python supplémentaire, base de données ou clé API n'est nécessaire.

## Pages

- `/` : connexion (page d’entrée)
- `/accueil` : accueil du site
- `/projet` : produits
- `/equipe` : parrainage
- `/compte` : compte
- `/notifications` : notifications
- `/connexion` : écran de connexion (formulaire de démonstration)
- `/inscription` : écran d’inscription (formulaire de démonstration)
- `/financement` : détails du financement (données illustratives)
- `/recharger` et `/retrait` : formulaires de démonstration sans transactions
- `/historique-recharges` et `/historique-retraits` : historiques vides
- `/gestion-compte-bancaire` et `/ajouter-compte-retrait` : gestion fictive des comptes de retrait
- `/a-propos`, `/regles` et `/service-client` : pages d’information et d’assistance

Les dossiers HTML et les captures importés sont conservés. Le serveur ne rend
accessibles que les pages et ressources explicitement listées, pas les autres
fichiers du projet.

## Limites

Il s'agit de maquettes HTML, pas d'un service financier opérationnel.
Les soldes, produits et informations de compte sont des exemples statiques.
Les achats, dépôts, retraits et comptes utilisateurs ne sont pas connectés
à un service réel. Certains boutons restent des éléments de démonstration.
Les pages de connexion et d’inscription ne créent pas de comptes et ne vérifient
pas d’identifiants ; aucun service d’authentification ni envoi de SMS n’est configuré.
Tailwind, Google Fonts et les images distantes nécessitent une connexion Internet.

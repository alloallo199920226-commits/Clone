# SHINERAY — projet importé

## Lancement

- Cliquez sur Run pour démarrer le workflow `Start application`.
- Commande : `python3 server.py`.
- Le serveur écoute sur `0.0.0.0:5000`.
- Aucune dépendance Python supplémentaire, base de données ou clé API n'est nécessaire.

## Pages

- `/` : accueil
- `/projet` : produits
- `/equipe` : parrainage
- `/compte` : compte
- `/notifications` : notifications

Les dossiers HTML et les captures importés sont conservés. Le serveur ne rend
accessibles que ces pages et leurs captures, pas les autres fichiers du projet.

## Limites

Il s'agit de maquettes HTML, pas d'un service financier opérationnel.
Les soldes, produits et informations de compte sont des exemples statiques.
Les achats, dépôts, retraits et comptes utilisateurs ne sont pas connectés
à un service réel. Certains boutons restent des éléments de démonstration.
Tailwind, Google Fonts et les images distantes nécessitent une connexion Internet.

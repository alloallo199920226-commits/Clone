# Remise à zéro des comptes clients — opération manuelle de production

**État : non exécutée en production.** L’accès de l’agent à la production est
en lecture seule. Le fichier `reset_customer_data.sql` est une répétition :
il termine par `ROLLBACK`, donc ne conserve aucune suppression.

## Données conservées

- Identités administrateur (`is_admin = true`), si présentes.
- Accès indépendant à la console, son mot de passe configuré et ses sessions.
- Produits, canaux de paiement, annonces, codes cadeaux et réglages.
- Paramètre d’activation des revenus produits.
- Structure des tables et séquences : les identifiants ne sont pas réutilisés.

## Données supprimées

Tous les comptes clients, sessions clients, portefeuilles, achats et revenus,
attributions VIP, dépôts, retraits, commissions, réservations, utilisations
de codes cadeaux et anciens journaux d’activité administrative.
Les identités administrateur conservées perdent aussi leur activité financière.

La suppression d’une commande locale **n’annule pas un paiement chez
l’opérateur** et n’effectue ni versement ni remboursement. Rapprocher les
paiements et retraits en attente avant de supprimer leurs références.

## Procédure

1. Faire une sauvegarde complète et en vérifier la restauration.
2. Suspendre l’application publiée et ses traitements de paiements/revenus.
   Ne pas laisser de requêtes en cours pendant le nettoyage.
3. Ouvrir la **base de production**, et vérifier explicitement l’environnement.
   Ne pas exécuter le fichier dans la console de développement par erreur.
4. Exécuter le fichier SQL complet dans une seule session. Vérifier les lignes
   `before` et `after`. Avec `ROLLBACK`, la base reste intacte.
5. Après validation du résultat, remplacer uniquement le dernier `ROLLBACK`
   par `COMMIT`, puis exécuter de nouveau le fichier complet dans la même cible.
6. Vérifier : aucun client, aucune activité ni demande de retrait ; produits,
   réglages et accès console conservés. Remettre l’application en service.

Ne jamais intégrer ce fichier au démarrage du serveur, à une migration,
au processus de publication ou à une route HTTP.

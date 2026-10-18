# SonaraPay — encaissement au Bénin

## Activation

- Compte marchand SonaraPay avec KYC validé et autorisation **SDK Payin**.
- Clé privée SDK dans le secret `SONARAPAY_KEY`, jamais une clé Gopay.
- Avec cette clé configurée, les comptes du Bénin utilisent le paiement direct
  MTN ou Moov. Celtiis n’est plus proposé pour les nouveaux dépôts ; ses anciennes
  demandes restent consultables et suivies. Les autres pays conservent les canaux manuels administratifs.
- Disponibilité réelle et autorisation de la clé restent contrôlées par SonaraPay.
- Le minimum du site reste 500 FCFA. Les règles de bonus et de parrainage existantes
  ne sont pas remplacées par celles d’un autre projet ou prestataire.

## Publication et base

La nouvelle table `shineray_sonarapay_orders`, ses contraintes et index sont définis
à la fin de `schema.sql`. Elle a été créée dans la base de développement.
À la publication, vérifier que la mise à jour de schéma proposée inclut cette table
dans la base de production. Ne pas copier ou remplacer les comptes existants.
Le serveur ne lance aucune migration de production au démarrage.

## Confirmation et reprise

L’opération est enregistrée avant le POST SonaraPay. Son identifiant produit une clé
d’idempotence stable. Une demande ouverte est reprise plutôt que remplacée.
Une coupure après le POST ne signifie pas que le paiement a échoué.
La même demande doit être suivie ou reprise ; ne pas en recréer une pour contourner
une erreur.

Seul un GET de statut authentifié indiquant `successful`, avec référence,
montant et devise correspondants, autorise le crédit. Les informations supplémentaires
du reçu, si présentes, sont également comparées. La comptabilisation partagée conserve
l’unicité du crédit et les commissions du premier dépôt réellement confirmé.
Les demandes en attente ne font pas partie du solde.

Le navigateur consulte le suivi toutes les 5 secondes lorsqu’il est visible ;
un suivi serveur toutes les 15 secondes reprend les références connues lorsque
l’instance fonctionne. Après redémarrage, les demandes persistées sont reprises.
L’historique permet de retrouver une demande sans conserver l’onglet d’origine.
Un état inconnu ou un reçu incohérent n’autorise jamais un crédit.

Les webhooks marchands sont suspendus dans la documentation fournie.
Cette intégration ne dépend donc pas de leur envoi et n’expose pas de récepteur
de crédit. Le secret BKaPay interne à SonaraPay n’est pas demandé.

Une clé remplacée ne peut pas consulter les opérations appartenant à l’ancienne clé.
Le suivi refuse cette réutilisation ; résoudre les demandes ouvertes auprès du
prestataire avant de changer de clé.

## Sécurité et tests

- Clé exclusivement côté serveur ; destinations HTTPS fixes et redirections refusées.
- Un client ne peut créer un paiement pour un autre compte ni consulter ses demandes.
- Code PIN Mobile Money jamais demandé. L’éventuel OTP opérateur n’est ni journalisé,
  ni enregistré dans les demandes ou dans le stockage du navigateur.
- Les frais et le montant net du prestataire ne sont pas inventés ; le montant de
  dépôt confirmé est crédité selon la politique du site.
- Pas de bac à sable fourni par ces endpoints : toute création réelle peut déclencher
  un débit. Faire un test réel uniquement avec consentement et téléphone autorisé.

Tests sans débit réel, avec transport SonaraPay simulé :

```sh
RUN_ACCOUNT_INTEGRATION_TESTS=1 python3 -m unittest discover -s tests -p 'test_sonarapay.py'
node tests/browser-reference-check.cjs --sonarapay
```

Ils utilisent des comptes temporaires de développement et nettoient leurs écritures.
Les tests de navigateur du parcours manuel utilisent un serveur isolé sans clé SonaraPay.

# NARKE — Audit de sécurité, corrections et preuves

Date : 5 novembre 2026.

## Conclusion

Les parcours financiers et les frontières d’accès examinés ont été renforcés,
avec **66 tests automatisés réussis**, deux parcours navigateur réussis et trois
analyses automatiques finales sans alerte.

Cela ne constitue **ni une certification, ni une garantie d’absence de toute
vulnérabilité**. Les risques résiduels et les vérifications de production sont
explicitement listés ci-dessous. Le design et les règles financières demandées
sont conservés. Aucun paiement réel ni effacement de clients réels n’a été
déclenché par les tests de cet audit.

## Périmètre et méthode

- Serveur HTTP, authentification client, sessions et console indépendante.
- Crédits administratifs, bonus d’inscription, dépôt manuel, règlement vérifié
  des paiements automatiques, achats VIP, retraits et réservations.
- Service de revenus produits et calculs/idempotence des commissions.
- Suppression administrative : autorisation, réauthentification, concurrence,
  confirmation, conservation des produits et annulation transactionnelle.
- Code SQL des parcours examinés, relations et contraintes des tables concernées.
- Accès HTTP aux fichiers privés et configuration du client prestataire.
- Dépendances du projet et du bac à maquettes.

Les essais financiers utilisent des comptes fictifs de développement. Les essais
de suppression utilisent un schéma jetable isolé. Le prestataire est simulé dans
les tests ; aucune demande de débit Mobile Money réelle n’est envoyée.
Les contrôles de production ont été strictement en lecture seule.

## Constats corrigés

Les niveaux décrivent le risque observé dans ce contexte ; un durcissement
préventif n’est pas présenté comme la preuve d’un vol de fonds.

| Réf. | Gravité | Constat | Correction vérifiée |
|---|---|---|---|
| S1 | ÉLEVÉ | Dépendance Zod 3.25.76 signalée pour épuisement mémoire, GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404. Elle appartenait aux dépendances de développement du bac à maquettes, pas au moteur financier Python. | Passage à Zod 4.6.7 ; analyse de dépendances finale sans alerte, vérification TypeScript et compilation réussies. |
| S2 | ÉLEVÉ | Le serveur créait des threads sans plafond applicatif et ne bornait pas le temps d’attente d’une connexion lente. Risque de saturation, pas preuve de création d’argent. | Plafond de 48 travailleurs par instance, réponse 503 lorsque saturé, délai socket de 15 secondes. Tests de saturation, reprise et délai réussis. |
| S3 | MOYEN | Plusieurs opérations sensibles ne possédaient pas de limitation persistante de fréquence, notamment inscriptions et écritures membres. | Compteurs partagés en base, séparés des tentatives de connexion ; contrôle concurrent atomique. Inscription : 120 appels/15 min par pair réseau ; connexion : 180/15 min par pair, en plus du blocage par numéro déjà existant ; écritures membre : 60/min par compte ; suivi paiement : 120/min par compte ; écritures de la console passant par son répartiteur général : 120/min par session. Les limites spécifiques déjà présentes restent actives. |
| S4 | MOYEN | Absence de politique explicite d’encadrement et de destination des formulaires. Durcissement contre l’intégration dans une page tierce trompeuse. | CSP avec `frame-ancestors` limité au site et aux domaines de l’éditeur Replit ; `form-action 'self'`. Pas de changement visuel. |
| S5 | FAIBLE | Le parseur acceptait les champs JSON dupliqués et les nombres non standards ; une imbrication excessive pouvait provoquer une erreur de récursion non traitée. Aucun contournement financier par ce moyen n’a été démontré. | Refus HTTP 400 des doublons, NaN, Infinity et imbrications excessives. Limite de corps 16 Kio conservée, test HTTP 413 réussi. |
| S6 | FAIBLE | Un jeton client malformé/non ASCII pouvait atteindre la fonction de hachage ASCII et provoquer une erreur de service, sans authentifier l’attaquant. | Validation du format avant connexion à la base. Tests prouvant le rejet avant tout accès SQL. |
| F1 | MOYEN, fonctionnel | Le code autorisait les dépôts dès 300 FCFA alors que trois contraintes SQL imposaient encore 500 FCFA, en développement comme en production. Cela bloquait de vrais montants autorisés, sans permettre de crédit frauduleux. | Source du schéma et base de développement alignées sur 300 FCFA. Test d’un dépôt automatique de 300 FCFA persisté, crédité une fois et rejoué sans second crédit. Production : modification encore à appliquer lors de la publication puis à vérifier. |

### Fichiers modifiés

- `server.py` : concurrence HTTP bornée, délai socket, JSON strict, CSP et
  application des limites de fréquence.
- `api_limits.py` : compteurs persistants, atomiques, espaces de clés distincts.
- `auth_backend.py` : format des jetons client avant accès à la base.
- `admin_api.py` : limitation du répartiteur général des écritures administratives.
- `schema.sql` : minimum de dépôt 300 FCFA dans les trois contraintes concernées.
- `artifacts/mockup-sandbox/package.json`, `pnpm-lock.yaml` : Zod corrigé.
- `.gitignore`, `.replitignore` : exclusion du résultat généré de compilation.
- Tests de sécurité, paiements et retraits : nouveaux cas et adaptation aux
  paramètres actuels, bonus de 1 500 FCFA et dépôt minimum de 300 FCFA.

Ces limites de fréquence ne sont **pas** un quota quotidien de retraits.
Le nombre de demandes reste illimité, avec le solde disponible et les horaires
déjà demandés. Elles empêchent les rafales d’appels.

## Protections financières existantes vérifiées

- Les soldes viennent du registre serveur ; une valeur modifiée dans le navigateur
  ne change pas le registre.
- Les anciennes routes de simulation de crédit ne créent pas d’argent.
- Les crédits administratifs exigent la session de console indépendante.
  Un compte client, même avec des paramètres « admin » ajoutés à sa requête,
  ne reçoit pas cette autorisation.
- Un paiement automatique n’est pas crédité sur la seule réponse de création,
  sur le frontend ou sur la déclaration du client.
- Le serveur interroge le prestataire via son URL HTTPS fixe. Il vérifie le statut,
  la référence, le montant exact et la devise attendue. Les champs optionnels
  d’identité de commande sont comparés lorsqu’ils sont présents.
- Le client prestataire ne suit pas les redirections qui pourraient divulguer
  la clé ou rejouer un POST vers une destination différente.
- Références uniques, identifiants stables et transactions atomiques empêchent
  les doubles crédits dans les scénarios de concurrence testés.
- Les commissions concernent seulement le premier dépôt approuvé et ne sont
  pas déclenchées par une simple inscription ou une confirmation falsifiée.
- Un client ne peut lire ni relancer le paiement d’un autre client.
- Les retraits réservent les fonds ; achats et retraits concurrents utilisent
  le verrou du compte et vérifient le solde réellement disponible.
- L’approbation manuelle transforme une réservation en débit sans second débit.
  Le refus libère la réservation. Les destinataires et frais restent figés.
- Les revenus produits respectent les périodes de 24 heures et les conditions
  figées ; les rejeux ne produisent pas un second versement pour la même période.
- Les routes de fichiers privés testées ne servent ni code serveur, ni fichiers
  de secrets, ni archives d’administration, ni configuration Git.

### Webhooks

L’intégration examinée utilise une interrogation serveur du statut auprès du
prestataire, pas un webhook public de confirmation créditant un compte.
Il n’y a donc pas de signature de webhook à « activer » artificiellement.
Les fausses demandes ne deviennent pas une preuve de paiement.
Tout futur webhook devra être authentifié suivant la documentation officielle
du prestataire et revérifié avant règlement.

## Tests et résultats

### 66 tests Python : tous réussis

Commande :

```text
RUN_ACCOUNT_INTEGRATION_TESTS=1 python3 -m unittest \
  tests.test_api_hardening \
  tests.test_security_boundaries \
  tests.test_admin_customer_reset \
  tests.test_withdrawals \
  tests.test_financial_policy \
  tests.test_sonarapay \
  tests.test_product_income \
  tests.test_deposit_minimum -q
```

Cas couverts : faux crédits, faux privilèges, montants et devises falsifiés,
paiements d’autres utilisateurs, états d’attente/échec sans crédit, première
commission, concurrence, idempotence, réservations, refus de dépenses au-delà
du disponible, heures de retrait, revenus 24 heures, réauthentification
administrateur, CSRF, suppression atomique et annulation complète après erreur,
JSON abusif, sessions malformées et limites persistantes.

Le test de saturation simule l’occupation des travailleurs : aucun test DDoS
ou de charge destructive n’a été lancé contre la production.

### Navigateur : deux parcours réussis

- `node tests/browser-reference-check.cjs --withdrawal` :
  VIP obligatoire, minimum 1 500 FCFA, frais de 20 %, demande unique,
  réservation et historique mobile.
- `node tests/browser-reference-check.cjs --admin-customer-reset` :
  contrôle visible seulement après connexion, aperçu, annulation, phrase exacte,
  sauvegarde, mot de passe effacé, expiration, protection contre les doubles clics
  et résultat serveur. Les réponses de suppression sont simulées pour ne pas
  supprimer les utilisateurs de développement partagés.

### Analyses automatiques finales

| Analyse | Résultat |
|---|---|
| Dépendances | 0 critique, 0 élevée, 0 moyenne, 0 faible |
| Code statique | 0 résultat ; scan déclaré complet |
| Flux de données/confidentialité | 0 résultat |
| TypeScript du bac à maquettes | Réussi |
| Compilation du bac à maquettes | Réussie, avec avertissements non bloquants de chemins d’images de maquettes |
| Compilation Python et contrôle du diff | Réussis |
| Démarrage des deux services | Réussi |

Une absence d’alerte automatique n’est pas une preuve d’absence de faille.

## Vérifications de production en lecture seule

- Aucun compte trouvé avec un solde comptable négatif.
- Aucun compte trouvé avec un solde disponible négatif après réservations.
- Les trois contraintes de dépôt contrôlées imposent encore **500 FCFA**.
  Elles sont corrigées à **300 FCFA en développement**, pas encore en production.
- Les attributs du rôle de lecture de la réplique ont été consultés ; ils ne
  prouvent pas les permissions exactes du rôle utilisé par le serveur publié.
  Aucun privilège de production n’a été modifié.

Ces résultats sont une photographie au moment de la lecture, pas une surveillance
continue ni une garantie sur toutes les opérations historiques.

## Risques et limites restant à traiter

1. **ÉLEVÉ — comptes multiples et identité non vérifiée.** Le téléphone est un
   identifiant déclaré, sans preuve de propriété, conformément au parcours demandé.
   Le bonus d’inscription est autorisé une fois par compte, pas une fois par personne
   physiquement vérifiée. La limitation de fréquence freine l’automatisation mais
   ne supprime pas le risque de comptes multiples. Une politique anti-abus
   complémentaire nécessite une décision produit ; cet audit n’a pas supprimé le
   bonus ni ajouté d’e-mail/SMS contre la demande existante.
2. **MOYEN — console sans second facteur.** La session et le mot de passe dédié
   sont vérifiés côté serveur ; un second facteur n’a pas été ajouté. Un mot de
   passe réellement compromis reste un risque. La réauthentification de suppression
   et les limitations de tentatives ne remplacent pas un second facteur.
3. **MOYEN — journaux dans la même base.** Le registre et l’audit sont transactionnels
   mais ne sont pas un journal externe immuable. Une compromission complète du
   serveur ou des droits de base pourrait les altérer. Prévoir une copie indépendante,
   restreinte et contrôlée, avec une politique de conservation compatible avec
   l’effacement volontaire des comptes clients.
4. **Vérification restante — droits minimaux de la base du serveur publié.**
   L’accès de cet audit à la production est en lecture seule via la réplique.
   Le cloisonnement du rôle d’exécution et la restauration d’une sauvegarde
   de production n’ont pas été validés par un essai destructif.
5. **Protection HTTP partielle contre les scripts injectés.** La CSP ajoute
   l’anti-encadrement et les destinations de formulaire, mais ne comporte pas
   encore de politique `script-src` stricte à nonces pour tous les scripts historiques.
   Cela exige une intégration compatible avec les pages et scripts importés,
   pas l’ajout aveugle d’un en-tête qui casserait la plateforme.
6. **Limites réseau.** Les quotas anonymes utilisent le pair réseau réel, pas
   des en-têtes transférés arbitraires. Un proxy partagé peut regrouper plusieurs
   visiteurs. Les seuils doivent être surveillés et calibrés sans faire confiance
   à un `X-Forwarded-For` fourni par un attaquant. La protection DDoS distribuée
   et la configuration du périmètre réseau ne sont pas certifiées par ces tests.
7. **Publication et vérification nécessaires.** Les corrections ne doivent pas être
   considérées actives sur le site public avant republication et contrôle des
   contraintes effectives. Aucun démarrage ni hook de déploiement ne modifie la
   base de production à sa propre initiative.

## Recommandations prioritaires

1. Publier les correctifs puis comparer les contraintes effectives des trois tables
   de dépôts en production avec le seuil de 300 FCFA.
2. Mettre en place une protection anti-inscriptions automatisées, compatible avec
   le parcours sans SMS, avant de considérer le bonus protégé contre les multi-comptes.
3. Ajouter un second facteur propriétaire et une politique de rotation d’accès
   sans jamais placer les secrets dans le code ou le navigateur.
4. Organiser sauvegardes, restauration testée et audit indépendant.
5. Étendre ensuite la CSP aux scripts historiques avec nonces et tests de navigation.

**Aucun vol de fonds ni création arbitraire de solde n’a été démontré par les
scénarios exécutés. Cela ne démontre pas que toute attaque imaginable est impossible.**

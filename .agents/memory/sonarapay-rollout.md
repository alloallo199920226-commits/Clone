---
name: SonaraPay rollout
description: User-defined country scope for the initial SonaraPay integration.
---

L’utilisateur veut intégrer SonaraPay « pour les paiements au bénin seule d'abord ».

**Why:** l’utilisateur a explicitement limité le lancement au Bénin.

**How to apply:** limiter le parcours SonaraPay aux comptes du Bénin et préserver le parcours existant des autres pays. Ne pas étendre cette intégration à d’autres pays sans nouvelle demande.

Dans le parcours SDK direct, ne pas présenter les coordonnées et codes USSD des
canaux manuels administratifs comme instructions de paiement SonaraPay.

**Why:** un paiement SDK est initié auprès du prestataire et confirmé par son statut
serveur ; faire également transférer au compte manuel pourrait provoquer un double paiement.

**How to apply:** distinguer clairement le suivi du paiement automatique des instructions
de transfert manuel, même si les deux parcours partagent l’habillage IVECO.

Le point d’entrée SonaraPay peut refuser le client Python par défaut avec une
réponse HTML 403, indépendamment de la validité d’une clé.

**Why:** des requêtes GET sans authentification ont reçu un refus HTML avec
Python-urllib, mais la réponse JSON 401 normale avec un User-Agent identifiant
l’application. Un refus de passerelle avait été présenté à tort comme une erreur de clé.

**How to apply:** identifier honnêtement le client HTTP de l’application ; distinguer
les refus HTML de la passerelle des erreurs JSON d’authentification du prestataire.
Vérifier uniquement par GET lors du diagnostic, sans créer un paiement réel.

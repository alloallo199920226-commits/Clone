---
name: SonaraPay rollout
description: User-defined country scope for the initial SonaraPay integration.
---

Ne pas afficher la mention SonaraPay dans les interfaces de la plateforme.

**Why:** l’utilisateur a demandé « N'affiche la mention de sonarapay nul part ».

**How to apply:** employer des libellés neutres dans les messages, traductions et reçus, y compris les historiques existants ; conserver les identifiants techniques internes pour le suivi des paiements.

Signaler automatiquement les dépôts échoués et rediriger vers l’accueil après 10 secondes lorsqu’un paiement est confirmé réussi ou échoué.

**Why:** l’utilisateur a demandé ce comportement pour les deux résultats définitifs.

**How to apply:** démarrer le délai uniquement après confirmation serveur du crédit ou d’un échec ; ne pas considérer une attente, une coupure réseau ou une vérification différée comme un échec.

L’utilisateur veut intégrer SonaraPay « pour les paiements au bénin seule d'abord ».

**Why:** l’utilisateur a explicitement limité le lancement au Bénin.

**How to apply:** limiter le parcours SonaraPay aux comptes du Bénin et préserver le parcours existant des autres pays. Ne pas étendre cette intégration à d’autres pays sans nouvelle demande.

Pour les dépôts au Bénin, proposer uniquement MTN et Moov, sans Celtiis.

**Why:** l’utilisateur a demandé de retirer Celtiis des moyens de dépôt du Bénin.

**How to apply:** refuser les nouvelles demandes Celtiis sans supprimer ni interrompre le suivi des paiements déjà initiés.

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

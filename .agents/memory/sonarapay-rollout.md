---
name: SonaraPay rollout
description: User-defined country scope for the initial SonaraPay integration.
---

Ne pas afficher la mention SonaraPay dans les interfaces de la plateforme.

**Why:** l’utilisateur a demandé « N'affiche la mention de sonarapay nul part »,
puis a réaffirmé qu’elle ne devait apparaître nulle part sur le frontend.

**How to apply:** employer des libellés neutres dans les messages, traductions et reçus, y compris les historiques existants ; conserver les identifiants techniques internes pour le suivi des paiements.

Signaler automatiquement les dépôts échoués et rediriger vers l’accueil après 10 secondes lorsqu’un paiement est confirmé réussi ou échoué.

**Why:** l’utilisateur a demandé ce comportement pour les deux résultats définitifs.

**How to apply:** démarrer le délai uniquement après confirmation serveur du crédit ou d’un échec ; ne pas considérer une attente, une coupure réseau ou une vérification différée comme un échec.

Après une réponse réseau perdue lors du lancement, retrouver la demande existante par une lecture seule, sans relancer automatiquement un encaissement.

**Why:** l’utilisateur a signalé un débit Mobile Money alors que Safari affichait « Load failed » ; une réponse navigateur perdue ne permet pas de conclure à l’absence d’encaissement.

**How to apply:** conserver l’identifiant de demande avant transmission ; en cas de résultat incertain, proposer le suivi et non un nouveau paiement, y compris après rechargement. Ne jamais créditer sur la seule déclaration d’un débit.

Les références manquantes doivent être récupérées automatiquement en lecture
seule, sans approbation administrative requise pour un reçu exactement vérifié.

**Why:** l’utilisateur a insisté sur le crédit automatique après un dépôt Moov
réussi dont la réponse initiale avait été perdue.

**How to apply:** le guide actuel du prestataire documente GET /api/public/v1/payments :
la réponse est un tableau des 200 derniers paiements de la clé, et non un objet.
Faire correspondre l’identité immuable, le montant, la devise, le pays,
l’opérateur et le payeur, puis consulter le statut individuel avant crédit.
Une absence dans cette liste bornée ou une erreur de lecture ne prouve jamais
un échec et n’autorise pas à relancer un encaissement.

Les nouveaux dépôts du Bénin, Burkina Faso, Togo, Côte d’Ivoire et Cameroun
suivent le flux automatique, sauf Wave Côte d’Ivoire qui reste manuel.

**Why:** l’utilisateur a demandé « Remet ça sur automatique de nouveau Le
Burkina », remplaçant sa demande précédente de passage en manuel.

**How to apply:** proposer Orange/Moov/Telecel au Burkina et MTN/Moov au Bénin,
T-Money/Moov au Togo, Orange/MTN/Moov en Côte d’Ivoire et MTN/Orange au Cameroun.
Conserver XAF au Cameroun, XOF ailleurs, le suivi des anciennes demandes et
la validation des dépôts manuels déjà soumis. Celtiis reste désactivé.

Pour les dépôts au Bénin, proposer uniquement MTN et Moov, sans Celtiis.

**Why:** l’utilisateur a demandé de retirer Celtiis des moyens de dépôt du Bénin.

**How to apply:** refuser les nouvelles demandes Celtiis sans supprimer ni interrompre le suivi des paiements déjà initiés.

Dans le parcours SDK direct, ne pas présenter les coordonnées et codes USSD des
canaux manuels administratifs comme instructions de paiement SonaraPay.

**Why:** un paiement SDK est initié auprès du prestataire et confirmé par son statut
serveur ; faire également transférer au compte manuel pourrait provoquer un double paiement.

**How to apply:** distinguer clairement le suivi du paiement automatique des instructions
de transfert manuel, même si les deux parcours partagent l’habillage IVECO.

Pour Orange Money Burkina Faso, rendre la saisie du code temporaire accessible
dès le choix de l’opérateur, sans obliger à en fournir un avant de recevoir les
instructions de l’opérateur.

**Why:** l’utilisateur ne retrouvait plus l’espace OTP lorsqu’il était uniquement
affiché après la réponse du prestataire.

**How to apply:** distinguer ce code du PIN, ne jamais le conserver dans les
brouillons, journaux ou réponses, et ne pas réinitier une demande déjà en cours
au prétexte de transmettre un code.

Le point d’entrée SonaraPay peut refuser le client Python par défaut avec une
réponse HTML 403, indépendamment de la validité d’une clé.

**Why:** des requêtes GET sans authentification ont reçu un refus HTML avec
Python-urllib, mais la réponse JSON 401 normale avec un User-Agent identifiant
l’application. Un refus de passerelle avait été présenté à tort comme une erreur de clé.

**How to apply:** identifier honnêtement le client HTTP de l’application ; distinguer
les refus HTML de la passerelle des erreurs JSON d’authentification du prestataire.
Vérifier uniquement par GET lors du diagnostic, sans créer un paiement réel.

Le changement de marque ne doit pas renommer les identifiants techniques des
demandes historiques auprès du prestataire.

**Why:** la récupération d’un dépôt confirmé mais sans référence locale a pu être
vérifiée grâce à la description historique du prestataire, qui lie le reçu à la
demande d’origine. Renommer cette identité empêcherait cette correspondance.

**How to apply:** conserver la description et la clé d’idempotence d’origine lors
du suivi ou d’une récupération ; moderniser uniquement les libellés visibles.

Un message « informations de dépôt non disponibles » peut signaler un choix
de recharge perdu, et non des opérateurs désactivés. Certains parcours de
réouverture ou changements de contexte navigateur perdent le stockage de session.

**Why:** l’utilisateur a signalé ce message au Burkina après le passage à 500 FCFA ;
les opérateurs des cinq pays automatiques étaient bien disponibles aux tests.

**How to apply:** vérifier séparément le choix montant/canal et la configuration
des opérateurs. La récupération d’un choix peut transporter uniquement montant
et canal non sensibles ; elle ne récupère jamais un OTP, un téléphone, un statut
« payé » ni un crédit. Les contrôles serveur et l’appartenance des paiements
restent obligatoires.

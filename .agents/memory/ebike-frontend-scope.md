---
name: E-BIKE Pro frontend adaptation
description: User-approved visual direction and backend boundary for the new E-BIKE Pro presentation.
---

L’utilisateur souhaite le nouveau modèle E-BIKE Pro rouge et bleu sur toutes les
pages et tous les onglets frontend, sans toucher au backend. Il demande de changer
toute la géométrie des pages pour qu’on ne voie « aucun signe de narke et de son design ».

Il refuse une simple recoloration, même avec de nouvelles images : il demande de
changer complètement la géométrie, le positionnement et le regroupement des cartes,
sur chaque page et chaque état du paiement. « Un ancien utilisateur ne doit plus
reconnaître le site. » L’identité demandée évoque une industrie de fabrication de
vélos ultra premium avec plusieurs images distinctes.

**Why:** l’utilisateur a explicitement demandé cette limite lors de la fourniture
du modèle d’accueil, puis a demandé explicitement la refonte complète des autres pages.
Il a signalé à nouveau que les cartes du compte et de l’équipe restaient reconnaissables.

**How to apply:** travailler sur la présentation et les interactions frontend ;
préserver les comptes, API, codes produits, montants réels et règles financières.
L’administration est explicitement exclue : « ne touche pas le rendu de
l’administration, travaille juste sur le site seul ». Conserver son rendu existant,
y compris ses feuilles de style, ses formulaires et sa géométrie.
**Why:** l’utilisateur a corrigé explicitement le périmètre : la refonte concerne
uniquement le site utilisateur, pas l’administration.
Ne pas déduire des tarifs, stocks, livraisons ou nouvelles offres à partir des
images de référence. Ne pas reproduire de fausse barre d’état de téléphone.
Recomposer réellement les structures et l’ordre des contenus ; ne pas valider la
refonte à partir des couleurs et des textes seuls. Comparer les vues connectées et
les états ouverts, y compris le paiement, avant d’annoncer une correction complète.

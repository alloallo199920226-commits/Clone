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

L’utilisateur rejette aussi les pages « débordées, trop grandes et non stylées » :
sur mobile, garder des titres et bandeaux proportionnés, des actions équilibrées,
des en-têtes bornés et des états vides proches de leur contenu.

**Why:** après la refonte, ses captures ont encore montré des titres géants,
un logo et une cloche démesurés sur Retrait, des décorations coupées et de grands
espaces vides. La réussite des parcours fonctionnels ne prouvait pas la qualité visuelle.

**How to apply:** examiner les pages utilisateur connectées en entier sur téléphone,
pas seulement le premier écran ou l’absence de défilement horizontal global.
Contrôler les dimensions réelles des en-têtes, icônes et contrôles, ainsi que les
états vides et les sections situées sous la ligne de flottaison.

Le catalogue doit afficher « les informations des produits configurés depuis
l’admin », sans inventer des offres. L’utilisateur demande désormais des noms de
produits équivalents aux termes E-Bike : les intitulés génériques VIP peuvent
recevoir des noms de modèles côté site utilisateur.

**Why:** l’utilisateur a signalé que les produits affichés ne venaient pas de
l’administration, puis a précisé cette demande après l’explication d’une correction
ciblée de la lecture du catalogue côté serveur.

**How to apply:** préserver les noms enregistrés et les codes en données ; ne
renommer que leur présentation générique VIP sur le site. Garder les noms
personnalisés configurés par l’administrateur, les prix, revenus et durées enregistrés ;
laisser le catalogue vide si aucun produit n’est configuré. Cette correction
n’autorise pas à étendre les règles d’achat ni à modifier le rendu de l’administration.

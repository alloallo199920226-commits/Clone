---
name: Python runtime compatibility
description: Imported Replit runtime and uv-managed Python can differ.
---

Lancer ce projet avec `uv run python`, et non directement avec le Python du module Replit.

**Why:** le module importé utilise Python 3.12 alors que le projet exige Python ≥ 3.13. L’installation des dépendances sélectionne un Python plus récent ; le lancement direct peut alors ne pas trouver les paquets installés.

**How to apply:** conserver un lancement via uv pour les workflows et les vérifications, sauf si le module Replit est explicitement aligné avec la version exigée par le projet.

---
name: Python runtime compatibility
description: Imported Replit runtime and uv-managed Python can differ.
---

Conserver un module Python compatible avec la version du projet pour la publication ; un interpréteur disponible uniquement dans l’environnement de développement ne suffit pas.

**Why:** le projet importé configurait Python 3.12 tout en exigeant Python ≥ 3.13. `uv run` fonctionnait dans l’espace de travail grâce à un interpréteur plus récent, mais la publication échouait : aucun interpréteur compatible et téléchargements Python interdits.

**How to apply:** aligner le module Replit et la version sélectionnée par uv. Vérifier les dépendances et le démarrage avec les téléchargements Python désactivés avant de proposer une nouvelle publication.

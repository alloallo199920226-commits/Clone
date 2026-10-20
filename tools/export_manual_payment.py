"""Export the manual-only frontend without changing the running payment flow."""
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "generated-artifacts/paiement-manuel-iveco.zip"


def remove_between(text, start, end):
    first = text.index(start)
    last = text.index(end, first)
    return text[:first] + text[last:]


def build():
    files = {}
    for name in ("choisir-operateur.html", "confirmation-depot.html",
                 "deposit-flow.css", "iveco-payment.css", "iveco-confirmation.css",
                 "deposit-i18n.js", "deposit-flow.js"):
        files["pages/" + name] = (ROOT / "pages" / name).read_text()
    for name in ("choisir-operateur.html", "confirmation-depot.html"):
        key = "pages/" + name
        files[key] = files[key].replace('  <script src="/pages/sonarapay.js" defer></script>\n', "")
    key = "pages/confirmation-depot.html"
    # Remove the complete provider panel by its final dedicated notice.
    html = (ROOT / key).read_text().replace('  <script src="/pages/sonarapay.js" defer></script>\n', "")
    start = html.index('          <section class="sonara-panel"')
    tail = html.index('data-sonara-redirect', start)
    end = html.index('</section>', tail) + len('</section>')
    files[key] = html[:start] + html[end:]

    js = files["pages/deposit-flow.js"]
    js = js.replace("/* Manual instructions elsewhere; enabled countries use authenticated server Payin. */",
                    "/* Export du parcours manuel uniquement. */")
    js = remove_between(js, "  const requestedPayment =", "  function save()")
    js = remove_between(js, "  if (!form && draft?.payment_id)", "  if (!draft ||")
    js = js.replace('    const automatic = configuration.provider === "sonarapay";',
                    '''    if (configuration.provider === "sonarapay") {
      throw new Error("manualOnly");
    }''')
    js = remove_between(js, "    if (automatic && !confirmation)", "    if (confirmation)")
    js = remove_between(js, "    const trackPayment =", '    form.addEventListener("submit"')
    js = remove_between(js, "      if (automatic && draft.request_uncertain)", "      if (expired())")
    js = remove_between(js, "      if (automatic) {", '      if (save()) go("/confirmation-depot");')
    js = js.replace("    if (automatic && draft.request_uncertain) await trackPayment(true);\n", "")
    js = js.replace('["signIn", "accountError", "countryError"]',
                    '["signIn", "accountError", "countryError", "manualOnly"]')
    files["pages/deposit-flow.js"] = js
    i18n = files["pages/deposit-i18n.js"]
    i18n = re.sub(r'^    sonara\w*:.*\n', '', i18n, flags=re.M)
    i18n = i18n.replace('    ".sonara-panel": "sonaraPanel", ', '    ')
    i18n = i18n.replace("Valhalla Pay", "IVECO Pay")
    i18n = i18n.replace('    manualDetails:', '''    manualOnly: ["Ce pays utilise le paiement automatique. Ce ZIP contient uniquement le parcours manuel.", "This country uses automatic payment. This ZIP contains only the manual flow."],
    manualDetails:''')
    files["pages/deposit-i18n.js"] = i18n
    files["LIRE-MOI.md"] = """# IVECO — Paiement manuel

Extraction du frontend existant : choix d'opérateur et instructions manuelles.
Les branches de paiement automatique et le script du prestataire sont exclus.
Aucun secret, compte client ou fichier de base de données n'est inclus.
Le site actuel n'est pas modifié par cet export.

## Fichiers
- pages/choisir-operateur.html : opérateur, téléphone, montant et retour.
- pages/confirmation-depot.html : marchand, compte, code USSD, copie et composition.
- Les trois feuilles de styles, deux scripts et images locales sont inclus.
- Certains noms de classes CSS historiques sont conservés pour garder le design.

## Intégration dans votre backend
Servir les fichiers /pages/... et définir ces routes HTML :
- GET /choisir-operateur → pages/choisir-operateur.html
- GET /confirmation-depot → pages/confirmation-depot.html
Les routes /connexion et /recharger doivent exister dans votre application.
Utiliser HTTPS pour permettre la copie dans le presse-papiers.
Ne pas ouvrir les HTML avec file:// : les scripts utilisent des API authentifiées.

### GET /api/me
Session utilisateur requise, cookie sécurisé HttpOnly, même origine.
Exemple de structure (valeurs fictives) : {"id":"identifiant-du-compte"}.
Répondre 401 si la session est absente.

### GET /api/payment-channels/me
Renvoyer uniquement les canaux manuels autorisés pour le pays du compte connecté.
Exemple de structure (remplacer toutes les valeurs de démonstration) :
```json
{
  "provider": "manual",
  "countryCode": "+229",
  "phoneLength": 10,
  "channels": [{
    "id": 1,
    "operatorName": "MTN",
    "receiverName": "MARCHAND",
    "receiverNumber": "NUMERO_MARCHAND",
    "ussdTemplate": "*CODE*{account}*{amount}#",
    "logoText": "MTN",
    "logoColor": "#ffcc00",
    "logoUrl": "/pages/assets/mtn-logo.png"
  }]
}
```
Le code USSD doit être réel et configuré par l'administration ; l'exemple
ci-dessus n'est pas un code à composer. Les canaux peuvent avoir d'autres IDs.
La configuration automatique est explicitement refusée par cet export pour
éviter de montrer des instructions manuelles à la place d'un paiement automatique.

### Entrée depuis votre page Recharger
Avant de naviguer vers /choisir-operateur, enregistrer :
```js
sessionStorage.setItem("shineray-deposit-draft", JSON.stringify({
  amount_fcfa: 3500,
  channel: 1,
  created_at: Date.now()
}));
location.href = "/choisir-operateur";
```
La clé technique historique est conservée pour compatibilité. `channel` doit
valoir 1 ou 2 dans ce parcours hérité ; l'opérateur sera ensuite sélectionné
parmi les canaux renvoyés par le serveur. Le montant doit être entier, minimum
3 500 FCFA côté interface. Le serveur reste responsable des règles financières.
La durée du brouillon est de 20 minutes. L'identifiant du compte, l'indicatif,
l'opérateur et le téléphone sont complétés par le script.

## Limite importante : aucune validation financière automatique
Ce code présente les instructions manuelles existantes. Il n'envoie aucun
POST de dépôt. Le bouton « Obtenir le résultat » affiche une information :
il ne vérifie pas de transfert et ne crédite aucun solde.
Ce ZIP n'inclut donc pas un backend de validation des dépôts ni un schéma SQL.
Pour un encaissement manuel complet, votre backend doit enregistrer une demande
en attente et fournir une validation administrateur sécurisée, avec contrôle des
preuves, transaction SQL, crédit unique/idempotent et journal d'audit.
Ne jamais considérer un clic, un code USSD affiché ou une capture comme preuve
automatique de paiement. Ne jamais demander le PIN Mobile Money.
"""
    images = set()
    for name, text in files.items():
        if name.endswith((".css", ".js", ".html")):
            images.update(re.findall(r'/pages/assets/([A-Za-z0-9_.-]+)', text))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, text in files.items():
            archive.writestr(name, text)
        for name in sorted(images):
            archive.write(ROOT / "pages/assets" / name, "pages/assets/" + name)
    print(OUT.relative_to(ROOT))
    print(f"{len(files) + len(images)} fichiers, {OUT.stat().st_size} octets")


if __name__ == "__main__":
    build()

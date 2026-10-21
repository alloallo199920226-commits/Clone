---
name: Phone-only authentication scope
description: Durable authentication and recovery requirements for this app.
---

Use a phone number and password for registration and sign-in. Do not require an email address or SMS code.

**Why:** the user explicitly requested a simple phone-and-password flow without email or SMS. Without a second channel, the app cannot verify phone ownership or recover a forgotten password.

**How to apply:** keep the phone-only flow unless the user changes scope; continue to explain the verification and recovery limits.

Les blocages de connexion doivent être vérifiés avant de calculer ou comparer
le mot de passe, avec des compteurs persistants partagés entre les serveurs.
Un refus doit conserver son compteur malgré le retour d’une erreur.

**Why:** la protection précédente renvoyait une erreur après plusieurs échecs
mais continuait à vérifier chaque nouveau mot de passe ; les compteurs en mémoire
étaient aussi perdus au redémarrage et non partagés entre répliques.

**How to apply:** tester que même un mot de passe correct n’est pas évalué
pendant le blocage, préserver l’expiration du blocage et séparer les espaces
de limitation des clients et de l’administration.

The user requested adding Bénin, Burkina Faso, Niger and Cameroun to eligibility for both registration and sign-in.

**Why:** this request concerns account access, not activation of payment providers or financial services in those countries.

**How to apply:** preserve the existing eligible countries; do not treat account eligibility as authorization to enable payments.

Use real account data, not simulations. Until an actual payment provider is connected, financial actions must be unavailable rather than creating simulated transactions or implying funds moved.

**Why:** the user asked to remove demonstration text and use real data. Removing labels alone would misrepresent simulated activity as real payments.

**How to apply:** never mix old simulation records into financial histories or balances. Keep user-supplied reference rates distinct from activated financial terms.

Show the notification on every navigation to the home page, even if the visitor previously dismissed it; keep the separate notification page.

**Why:** the user explicitly described this recurring home-page behavior.

**How to apply:** do not persist dismissal across visits or browser-history navigation.

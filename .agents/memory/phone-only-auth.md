---
name: Phone-only authentication scope
description: Durable authentication and recovery requirements for this app.
---

Use a phone number and password for registration and sign-in. Do not require an email address or SMS code.

**Why:** the user explicitly requested a simple phone-and-password flow without email or SMS. Without a second channel, the app cannot verify phone ownership or recover a forgotten password.

**How to apply:** keep the phone-only flow unless the user changes scope; continue to explain the verification and recovery limits. Keep payment actions simulated until the user requests a verified payment integration.

---
name: Reference fidelity
description: User expectations for faithful screen reproduction and meaningful visual checks.
---

Reproduce the user’s supplied screen composition and text closely rather than substituting a different interface.

**Why:** the user repeatedly pointed out that the delivered notification and account screens did not match their references.

**How to apply:** compare the actual opened notification and signed-in account view to the supplied images. A screenshot of the closed selector or sign-in page does not verify an interactive or authenticated screen. Describe exactly which states were checked; do not imply iPhone Safari or published-site verification from a development Chromium check.

Use real photos of attractive modern vehicles, not screenshots as image backgrounds. Keep phone numbers and balances account-specific, never copied from a reference image.

**Why:** the user explicitly requested vehicle photos rather than screenshots and real platform data. Some imported remote images that appeared vehicle-related actually contained entire UI captures.

**How to apply:** inspect the rendered asset itself before accepting it as a vehicle photograph. Match layout without presenting reference financial figures as real funds or activated returns.

The country selector must show its states one after another and follow the real Internet connection, not just run a fast fixed animation.

**Why:** the user repeated that the first loader’s geometry was wrong and that the stages advanced too quickly without following their connection.

**How to apply:** preserve the reference panel and loader geometry, wait for actual server responses before advancing, and provide an explicit retry state on connection failure. Short minimum display times may make each stage visible on fast networks, but must never advance a pending request.

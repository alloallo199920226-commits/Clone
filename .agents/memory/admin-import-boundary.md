---
name: Administration import boundary
description: Preserve the supplied administration JavaScript without replacing the customer application.
---

The user requested that the supplied administration JavaScript remain exactly unchanged.
Integrate its interface with the existing application, rather than replacing the customer
site with the unrelated server included in the source bundle.

**Why:** the supplied server changes identities, branding and financial defaults. The
user supplied the archive to complete the administration dependencies, not to authorize
replacing existing accounts or changing the previously requested financial rules.

**How to apply:** verify the served administration JavaScript against the original archive.
Keep compatibility changes outside that script, preserve existing accounts, and obtain
an explicit decision before activating additional financial services or changing policy.

When preserving an imported client exactly, verify its actual browser requests as well
as direct API tests. A successful API test alone does not prove wire compatibility.

**Why:** the source bundle's history script sends HTML-escaped query separators, and
its logout sends no JSON body. Rewriting that JavaScript would break the user's
explicit source-preservation requirement.

**How to apply:** make narrow, validated server-side compatibility adaptations and
keep browser checks for search filtering, pagination and console logout.

L’utilisateur exige un mot de passe dédié à l’administration, tout en interdisant
l’accès aux utilisateurs non autorisés. Ce mot de passe ne remplace pas l’autorisation
explicite du compte.

**Why:** the user requested a separate password to protect the administration, after
explicitly requiring that unauthorized users never gain administration access.

**How to apply:** retain both account authorization and the dedicated console password.
Never turn knowledge of the private URL or shared console password into account promotion.

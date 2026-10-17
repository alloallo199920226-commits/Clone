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

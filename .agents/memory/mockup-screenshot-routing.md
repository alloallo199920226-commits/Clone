---
name: Mockup screenshot routing
description: Avoid false missing-page reports when verifying isolated design previews.
---

For mockup screenshots, use the sandbox workflow’s actual open port with the `/__mockup/preview/…` path. A request to the main application’s local server does not use the development domain’s path-based sandbox routing.

**Why:** Multiple design workers reported missing pages from the default screenshot destination while the same previews loaded correctly through the development domain and sandbox server.

**How to apply:** Inspect the existing sandbox workflow’s open ports before capturing. Keep canvas preview URLs on the development domain without a port suffix; only direct local screenshot requests need the sandbox port. Do not modify production routing to fix this verification mismatch.

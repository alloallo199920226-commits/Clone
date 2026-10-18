---
name: Published database constraint verification
description: A successful publish does not prove modified CHECK constraints reached production.
---

Verify modified financial CHECK constraints through read-only production introspection
after publishing; do not infer success from a successful deployment or passing development tests.

**Why:** a successful republication retained the old transaction-category constraint
in production, preventing welcome bonuses and rolling back registrations despite the
correct development constraint.

**How to apply:** compare pg_get_constraintdef for the affected constraint in both
environments. Preserve the welcome bonus and its true category; do not relabel it as
a commission or remove it to bypass the failure. Resolve schema synchronization through
the supported publishing/database interface, never production startup DDL or custom
production migration scripts.

---
name: shared-package-message-catalogs
description: Shared packages consume the host app next-intl catalog; do not hoist copy into COPY consts
type: project
last_verified: 2026-08-28
---

# Shared packages consume the host app catalog

Shared product packages (`packages/ui`, `packages/pages`, `packages/agent`,
`packages/contexts`) resolve user-visible copy through the **host app's**
next-intl context. They do not ship a second i18n runtime, a private message
JSON tree, or a `t`-prop plumbing layer.

**Why:** `bun run check:untranslated-strings` requires JSX copy to resolve
through a message catalog. next-intl already wraps `apps/app` via
`NextIntlClientProvider` in `apps/app/app/layout.tsx` (cookie locale, no
`[locale]` segment — epic #2497). A module-level `COPY` const only hides the
string from the ratchet; it is not translatable.

## How to apply

1. Add the English string to `apps/app/messages/en/<namespace>.json`.
2. Register a new top-level JSON file in `apps/app/i18n/messages.ts` (and the
   test stub `apps/app/tests/next-intl.stub.ts`) the first time that namespace
   is introduced.
3. In the shared package, call `useTranslations('<namespace>')` from
   `next-intl`, or `getTranslations` from `next-intl/server` in server
   components — the same way `apps/app` does.
4. Namespaces: `ui`, `pages`, `agent`, `contexts` (split further with nested
   keys if a file gets huge). `common` stays the app-owned namespace already in
   use.
5. Add `next-intl` as a package dependency (same version as `apps/app`) the
   first time that package catalogs copy.
6. Tests: `vi.mock('next-intl')` with `translateFromCatalog` from
   `apps/app/tests/next-intl.stub.ts`.

English (`en`) remains the sole production language. `en-XA` is the
pseudo-locale only. Do not add a second real locale. Epic #2497 stays
Deferred until it is explicitly undeferred. If a second locale is later
prioritized, the candidates are `fr` and `es`. Do not treat those as
in-progress work.

## Forbidden

- Hoisting user-visible copy into `const COPY = { ... }` (or an options-array
  `label:` field) to satisfy the untranslated-string ratchet
- A second i18n library or message tree inside `packages/*`
- Website/marketing copy (out of scope for this catalog)

See issue #2686. Parent epic #2497.

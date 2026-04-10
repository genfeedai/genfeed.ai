---
name: proxy.ts is the middleware file
description: Next.js 16 renamed middleware.ts to proxy.ts — never confuse this or suggest middleware.ts doesn't exist
type: feedback
---

In Next.js 16, the middleware file is `proxy.ts`, NOT `middleware.ts`. The file at `apps/app/proxy.ts` IS the middleware. Never question this, never suggest it needs to be renamed, never look for `middleware.ts`.

**Why:** User has corrected this multiple times. It wastes time and is frustrating.

**How to apply:** When working with Next.js middleware in this repo, treat `proxy.ts` as the canonical middleware file. Period.

---
name: SEO hard-cut routes
description: Retired or moved public content is removed without redirects; current references are deleted and prior-only 404/410 URLs resolve in the watchdog.
type: feedback
---

# SEO hard-cut route policy

**Why:** Vincent wants moved or retired content to have a clean lifecycle boundary. Keeping compatibility redirects preserves an old information architecture that should no longer exist and makes intentional removals look unfinished.

**How to apply:** Remove the old route and every current sitemap, navigation, internal-link, breadcrumb, and `llms.txt` reference to it. Do not add a redirect. A currently discovered URL that returns 404/410 remains an error until the current reference is removed.

**Note:** no prior-snapshot-comparing "SEO watchdog" (the `hard_cut_removed` classification) exists in this repo today — only build-time checks (`apps/website/scripts/seo/seo-rules.ts`, `apps/website/scripts/check-seo.ts`). If that watchdog is built, it should follow this policy; don't assume it already does.

---
name: SEO hard-cut routes
description: Retired or moved public content is removed without redirects; current references are deleted and prior-only 404/410 URLs resolve in the watchdog.
type: feedback
---

# SEO hard-cut route policy

**Why:** Vincent wants moved or retired content to have a clean lifecycle boundary. Keeping compatibility redirects preserves an old information architecture that should no longer exist and makes intentional removals look unfinished.

**How to apply:** Remove the old route and every current sitemap, navigation, internal-link, breadcrumb, and `llms.txt` reference to it. Do not add a redirect. In the SEO watchdog, a URL absent from current discovery that was seen only in a prior successful snapshot and now returns HTTP 404 or 410 is resolved with `hard_cut_removed`; do not emit derivative metadata/content errors for it. A currently discovered URL that returns 404/410 remains an error until the current reference is removed.

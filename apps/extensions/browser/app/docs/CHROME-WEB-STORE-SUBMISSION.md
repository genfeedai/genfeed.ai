# Chrome Web Store Submission

Last updated: 2026-04-01

## Status

- Automated tests: `11` files, `84` tests, all passing
- Production build: passes with `bun run build`
- Packaged zip: `4.52 MB` via `bun run package`
- Privacy policy: [`../PRIVACY.md`](../PRIVACY.md)
- Permission rationale: [`../PERMISSIONS.md`](../PERMISSIONS.md)

## Listing Copy

### Name

Genfeed.ai Browser Extension

### Short Description

Generate AI replies, save inspiration, and draft social content across X, YouTube, Instagram, Reddit, TikTok, Facebook, and LinkedIn.

### Detailed Description

Genfeed.ai brings your content workflow directly into the browser. Draft contextual replies, save posts for inspiration, and generate supporting media without leaving the page you are already on.

The extension supports X, YouTube, Instagram, Reddit, Facebook, TikTok, and LinkedIn. It uses your authenticated Genfeed.ai account to generate platform-aware replies, rewrite ideas, and capture source material for later use inside the Genfeed workspace.

Key capabilities:

- Generate AI-assisted replies from the current post context
- Save posts, videos, and discussions as inspiration
- Rewrite or expand content ideas without switching tabs
- Keep the same workflow across major social platforms

## Store Assets

### Available

- Extension icons are generated in the packaged build
- Privacy policy markdown exists and is ready to publish or link
- Permission justification exists and is ready for reviewer notes

### Still Needed

- Chrome Web Store screenshots for the popup and sidepanel flows
- Optional promo tiles / marquee art if the team wants them
- Final public privacy policy URL if the store listing should link to a hosted page instead of repo markdown

## Permission Summary

Current packaged manifest requests:

- `storage`
- `cookies`
- `tabs`
- `scripting`
- `activeTab`
- `sidePanel`
- Host access for X/Twitter, YouTube, Instagram, Reddit, Facebook, TikTok, LinkedIn, and `api.genfeed.ai`

Use [`../PERMISSIONS.md`](../PERMISSIONS.md) as the reviewer-facing justification.

## Manual Validation Still Required

These steps were not completed in this QA pass because they require a live signed-in browser session and/or production telemetry access:

1. Load `build/chrome-mv3-prod` in Chrome and complete Clerk sign-in against production.
2. Verify the popup and sidepanel stay authenticated after token sync.
3. Trigger a controlled runtime failure and confirm it appears in the extension Sentry project.
4. Capture Chrome Web Store screenshots from the authenticated popup and sidepanel states.

## Recommended Submission Bundle

- Packaged artifact from `bun run package`
- Hosted privacy policy URL or published markdown page
- Permission justification from [`../PERMISSIONS.md`](../PERMISSIONS.md)
- Screenshots from real authenticated extension flows

# Publication analytics in the browser extension

Open a published post or reply on X, LinkedIn, Reddit, YouTube, Instagram, Facebook or TikTok, then open Content Engine. Publication analytics looks up that exact page in the selected organization and brand. Home, feed and composer pages ask you to open a published post. An empty result means no recorded publication was found for this page.

A parent page can match several recorded replies. Choose a publication explicitly and use Previous/Next to browse results. Each detail preserves its original source and audience; manual and agent publications are not relabeled as extension publications. Open parent post means the available link provides context, rather than a confirmed permalink for the selected reply.

Observed zero is shown as zero. Missing or unavailable metrics show Unavailable. Sample date and Last saved describe the stored sample, not live platform data. Awaiting analytics means an eligible publication has no sample yet and collection is pending. Stale or failed collection can retain an older sample and its date.

Refresh analytics requests server collection, then reads saved detail once. It does not promise a new sample immediately. Reload saved metrics only reads saved detail. Retry is explicit; focusing the window does not retry. If the server has not rolled out insights, the panel shows an unavailable message.

For an unlinked captured publication, choose an account from the server-provided matches, then press Link account. Even one candidate requires selection. Linking reads the resulting detail once and does not automatically request collection. If access is missing or expired, Connect account or Reconnect account opens Genfeed settings using verified organization and brand slugs. If those slugs are unavailable, Open Genfeed to connect the original account opens the app without guessing a workspace route. A mismatch remains an explicit error.

## Reload and verify an installed build

Build Chrome MV3 using the production endpoint command in TESTING-GUIDE.md. In Brave, open brave://extensions, reload the unpacked extension from this checkout's build/chrome-mv3-dev directory, and reopen its side panel. Check a genuine current post, then a context page with multiple recorded replies. Confirm explicit selection, a saved zero versus missing metrics, source and audience labels, and account recovery without automatic linking. Switch brand and navigate while a request is pending; old metrics and account choices must disappear immediately. Check light/dark themes at 320px and 440px, keyboard selection, disabled actions and accessible error/status messages.

Automated fixtures mock scoped API and action acknowledgements. They prove URL, parsing, race and UI behavior without calling providers, publishing, collecting analytics or attaching a real credential. Installed Brave behavior and actual backend rollout require separate live evidence.

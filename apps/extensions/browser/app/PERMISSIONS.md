# Genfeed Chrome Extension - Permissions Justification

**Last updated:** October 25, 2026

Why the extension asks for each permission and what it does with it. The Chrome Web Store listing pastes the short form from [`docs/CHROME-WEB-STORE-SUBMISSION.md`](./docs/CHROME-WEB-STORE-SUBMISSION.md).

The extension only reads a page when you ask it to: by opening the Genfeed menu next to a reply box, or by choosing a Genfeed item in the right-click menu. It does not watch the pages you browse. Nothing is posted for you; Genfeed fills the reply box and you post it yourself.

## Permissions

| Permission | What it is used for | Data touched |
| --- | --- | --- |
| `storage` | Keeps your login session, settings, saved-source lists and unsent drafts in the browser. | Local only |
| `activeTab` | After you pick a Genfeed item from the right-click menu, lets the extension read that page. | The page, selection, link or media you chose |
| `scripting` | Runs the capture above on the active tab, after your click. | Same as above |
| `contextMenus` | Adds "Remix with GenFeed", "Save source to Genfeed" and "Add to Genfeed Knowledge". | None |
| `sidePanel` | Shows the Genfeed side panel: saved sources, library, analytics. | None |
| `tabs` | Reads the active tab's URL and title so a saved source points at the right page, watches tab navigation on X and LinkedIn to confirm a post you published, and opens Genfeed links. | Tab URL and title |
| `downloads` | Saves a generated image or video from your library to disk when you click Download. The save dialog always opens. | The file you chose |
| `nativeMessaging` | Optional. Talks to the Genfeed local bridge (`gf host`) that you installed on your own computer. Used only if you turn on a local fallback provider in Settings. | The draft or post and your brand voice, sent to your own computer only |

## Host permissions

| Hosts | Used for |
| --- | --- |
| `x.com`, `twitter.com`, `linkedin.com`, `reddit.com`, `threads.com`, `threads.net`, `facebook.com`, `instagram.com`, `tiktok.com`, `youtube.com` | Adds the Genfeed button beside the reply box and reads the post you are replying to when you use it. |
| `genfeed.ai`, `app.genfeed.ai`, `api.genfeed.ai` | Signs you in with your Genfeed session and sends requests to the Genfeed API. |
| `genfeed.localhost` | Development hosts. They have no effect for users. |

The extension no longer requests the `cookies` permission. It signs in by sending your Genfeed session with its requests to the Genfeed API, which the host permissions above already allow.

## What leaves your browser

Only when you use a feature, and only to the Genfeed API (or, for the optional local bridge, to your own computer):

- **Generate reply, reply with media, generate image:** the text and author of the post you are on, the platform, the post URL, and your brand voice.
- **Proofread, rewrite:** the text in the reply box.
- **Save source, remix, add to Knowledge:** the page URL and title, plus the selection, link or media URL you chose.
- **Publication analytics (X and LinkedIn):** when you publish a post or reply, its text, link, author handle and date.
- **Sign-in:** your session token.

Error reports go to Sentry in production builds with request bodies, cookies, user info and AI inputs and outputs switched off.

See the [privacy policy](./PRIVACY.md) for retention and your choices.

## Your control

- Remove the extension to revoke every permission.
- Clear its data in Chrome: Extensions, Genfeed, Details, Site settings.
- Leave the local fallback on "Off" and `nativeMessaging` is never used.

## Contact

Privacy: privacy@genfeed.ai. Support: support@genfeed.ai. Website: <https://genfeed.ai>.

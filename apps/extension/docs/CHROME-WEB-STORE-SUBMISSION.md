# Chrome Web Store Submission

Everything the Developer Dashboard asks for, ready to paste, plus the order to do it in. The extension has never been published. Items marked **Owner** need the Genfeed Google account, a payment card or a reviewer account, and cannot be done from CI.

## Order of work

**If a store item already exists** (a draft, a pending review or an earlier listing), skip steps 1, 3 and 4. Copy the existing Item ID and the public key from the item's **Package** tab, then continue at step 5. Check the item's status and any reviewer feedback in the dashboard first. As of 2026-10-25 the update service reports no public item for the ID in this repo's manifest, so an existing item would have a different ID.

1. **Owner**: register the developer account and pay the one-time fee at <https://chrome.google.com/webstore/devconsole>. Two-step verification must be on. The developer email cannot be changed afterwards.
2. Package a build without submitting. Run the `Browser Extension - Package and Submit` workflow from `master` with `submit` off, and download the `browser-extension-build` artifact (`chrome-mv3-prod.zip`).
3. **Owner**: in the dashboard choose **Add new item** and upload that ZIP. Do not submit yet. The upload creates the item and its permanent ID.
4. **Owner**: open the item's **Package** tab and copy the **Item ID** and the **public key**. Send both to the release thread.
5. Release thread: put the public key in `package.json` under `manifest.key`, set `CHROME_EXTENSION_ID` on the API (CORS rejects the extension without it), so local builds get the store's ID (the submitted package never carries the key). See [Extension ID](#extension-id-and-api-access).
6. **Owner**: fill the Store listing, Privacy, Distribution and Test instructions tabs from this page.
7. **Owner**: create the OAuth credentials and the `EXTENSION_SUBMIT_KEYS` secret (see [Publishing keys](#publishing-keys)).
8. Tag `extension-browser-v<package version>` from `master`. The workflow tests, builds, validates the secret and submits.

## Extension ID and API access

The Chrome Web Store assigns the ID when the item is first uploaded, and the public key the dashboard shows is what keeps a local build on that same ID. The `manifest.key` currently in `package.json` was generated locally and gives the ID `djbmffnmdeekbejpfhammiijhdpjegcp`. That is **not** the store's ID unless the store happens to use the same key, so do not put it in `CHROME_EXTENSION_ID` or in the secret until step 4 confirms it.

The API only allows `chrome-extension://<CHROME_EXTENSION_ID>` as a CORS origin in production (`packages/libs/config/cors.config.ts`); with the variable unset the extension gets no access. The `extId` in `EXTENSION_SUBMIT_KEYS` must be the same 32-letter ID.

The dashboard rejects an uploaded package whose manifest has a `key` field ("key field is not allowed in manifest"). The key is for development builds only, so the packaging workflow removes it, along with the `*.genfeed.localhost` development hosts, from `chrome-mv3-prod.zip` and fails if either is still there. Keep it in `package.json` for local builds, and never add it to a package you upload by hand.

## Listing

The store reads the item name and summary from the package manifest (`displayName` and `description` in `package.json`), so a change to either needs a new upload. Keep the description free of lists of platform names: the store rejects those as keyword spam.

| Field | Value |
| --- | --- |
| Name | Genfeed |
| Category | Productivity |
| Language | English |
| Summary (max 132 characters) | Write, rewrite and reply with content that sounds like your brand. Save sources from any page to reuse later. |
| Privacy policy URL | <https://genfeed.ai/privacy> (has a Browser Extension section) |
| Homepage URL | <https://genfeed.ai> |
| Support URL | <https://genfeed.ai/contact> |

### Description

```
Genfeed helps you write social content that sounds like your brand and reads well, right where you work.

Next to the reply box on the social sites you use, Genfeed adds one small logo button. Open it to:

• Draft a reply from the post you are reading
• Proofread what you have typed
• Rewrite it in your brand voice
• Reply with an image, a video or a GIF
• Generate an image for the post
• Save the post as a source for later

Genfeed only fills the reply box. You read it, edit it and post it yourself. Nothing is published for you.

Right-click anywhere on the web to remix a page, add it to your Genfeed Knowledge or save it as a source. The side panel keeps your saved sources, your library and analytics for the posts you publish.

You need a Genfeed account. The extension signs in with your existing Genfeed session and uses your brand voice and workspace.

Optional: if you install the Genfeed local bridge on your own computer, Genfeed can fall back to your own AI command-line tool when the cloud service is unavailable. It is off unless you turn it on.

Genfeed is an independent product and is not affiliated with or endorsed by any social network.
```

## Privacy tab

**Single purpose**

> Draft, rewrite and reply to social media posts with Genfeed AI, and save web pages as sources in the user's Genfeed workspace.

**Permission justifications** (paste one per field; the reviewer-facing detail is in [`../PERMISSIONS.md`](../PERMISSIONS.md))

| Permission | Justification |
| --- | --- |
| `storage` | Keeps the login session, settings and unsent drafts in the browser. |
| `activeTab` | When the user picks "Save source to Genfeed", "Remix" or "Add to Genfeed Knowledge" from the right-click menu, reads the page or selection the user chose. |
| `scripting` | Runs the capture above on the active tab, only after that click. |
| `contextMenus` | Adds the three right-click items: Remix with GenFeed, Save source to Genfeed, Add to Genfeed Knowledge. |
| `sidePanel` | Shows the Genfeed side panel for sources, library and analytics. |
| `tabs` | Reads the active tab's URL and title to save the right source, and watches tab navigation on X and LinkedIn to confirm a post the user published. Also opens Genfeed links. |
| `downloads` | Saves a generated image or video from the user's library to disk, after the user clicks Download. |
| `nativeMessaging` | Optional. Talks to the Genfeed local bridge the user installed themselves. Off by default. |
| Host access: supported social sites | Adds the Genfeed button beside the reply box on the social sites listed in the manifest and reads the post the user is replying to. |
| Host access: `genfeed.ai`, `app.genfeed.ai`, `api.genfeed.ai` | Signs the user in and sends requests to the Genfeed API. |

**Remote code**: No. All code ships in the package.

**Data usage** (proposed answers, confirm against the privacy policy before submitting)

- Personally identifiable information: yes. Name and email from the user's Genfeed account.
- Authentication information: yes. The Genfeed session token.
- Website content: yes. The text of the post the user replies to, the draft they ask Genfeed to rewrite, and pages or selections they choose to save.
- User activity: yes. On X and LinkedIn, a post or reply the user publishes (its text, link, author handle and date) is recorded in their Genfeed workspace so publication analytics can find it.
- Not collected: health, financial, location, personal communications, web history.

**Certifications**: data is not sold or transferred to third parties outside the approved use cases, not used for purposes unrelated to the single purpose, and not used for creditworthiness or lending.

## Test instructions

Reviewers need a working account. **Owner**: create a dedicated reviewer account with one organization and one brand, and paste its credentials into the dashboard's Test instructions field. Do not reuse a personal account.

```
1. Open https://app.genfeed.ai and sign in with the reviewer account below. Keep the tab open.
2. Click the Genfeed toolbar icon. The popup should show the signed-in workspace.
3. Open https://x.com, open any post and click Reply. A small outline GenFeed logo button appears beside the Reply button. Click it for the menu.
4. Choose "Generate reply". The reply box is filled. Nothing is posted.
5. Right-click any page and choose "Save source to Genfeed". The side panel opens with the saved source.

Reviewer account: <email> / <password>
```

## Store assets

| Asset | Size | Status |
| --- | --- | --- |
| Store icon | 128 x 128 | Generated by Plasmo from `assets/icon.png` (500 x 500) |
| Screenshots | 1280 x 800, 1 to 5 | **Owner**: capture from a signed-in browser, see [Screenshots](#screenshots) |
| Small promo tile | 440 x 280 | Optional |
| Marquee | 1400 x 560 | Optional |

### Screenshots

Capture real states from a signed-in browser. Do not submit mock-ups of X or LinkedIn. Suggested set:

1. The Genfeed button beside Reply on X, menu open.
2. The reply box filled with a generated reply.
3. Proofread preview card in the composer.
4. The right-click menu on a web page.
5. The side panel with saved sources.

## Publishing keys

`EXTENSION_SUBMIT_KEYS` is a GitHub Actions secret holding Plasmo BPP JSON, Chrome only:

```json
{
  "chrome": {
    "clientId": "...",
    "clientSecret": "...",
    "refreshToken": "...",
    "extId": "<32-letter item ID from the Package tab>"
  }
}
```

1. In Google Cloud, create a project, set up the OAuth consent screen as External, add the publishing Google account as a test user, then publish the app.
2. Enable the [Chrome Web Store API](https://console.developers.google.com/apis/library/chromewebstore.googleapis.com).
3. Create an OAuth client ID of type **Desktop app** at <https://console.developers.google.com/apis/credentials> and download it as `key.json`.
4. In the folder with `key.json`, run `npx gcp-refresh-token` and approve the consent screen with the Google account that owns the store item. `key.json` now has `clientId`, `clientSecret` and `refreshToken`.
5. Add the JSON above as the repository secret `EXTENSION_SUBMIT_KEYS`.

Source: the [Plasmo token guide](https://github.com/PlasmoHQ/chrome-webstore-api/blob/main/token.md) and Google's [Chrome Web Store API guide](https://developer.chrome.com/docs/webstore/using-api).

## Known risks for review

- **Broad host access.** Eight social platforms plus the Genfeed hosts. Each is justified above, and the extension only reads a post when the user opens the menu.
- **Selectors on live pages.** Threads, Instagram, TikTok, YouTube and Facebook have not been checked on live pages. Run the platform checks in [`TESTING-GUIDE.md`](./TESTING-GUIDE.md) before submitting.
- **Version.** The package version is `1.0.0`, so the first tag is `extension-browser-v1.0.0`. It is independent of the product release tags.

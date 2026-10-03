# Multi-Platform Extension Testing Guide

## Pre-Testing Setup

1. **Build from this repository** (MacBook builds only; tests/typechecks use Mac Studio)

   ```bash
   cd apps/extensions/browser/app
   bun run css:build
   env PLASMO_PUBLIC_ENV=production \
     PLASMO_PUBLIC_APP_ENDPOINT=https://app.genfeed.ai \
     PLASMO_PUBLIC_API_ENDPOINT=https://api.genfeed.ai/v1 \
     PLASMO_PUBLIC_ASSETS_ENDPOINT=https://cdn.genfeed.ai/assets \
     PLASMO_PUBLIC_WEBSITE_ENDPOINT=https://genfeed.ai \
     PLASMO_PUBLIC_WS_ENDPOINT=https://notifications.genfeed.ai \
     npm exec -- plasmo build --tag=dev --target=chrome-mv3 --with-source-maps
   ```

After building, transfer the exact built folder to the assigned Mac Studio checkout and run the compiled startup probe there:

```bash
cd apps/extensions/browser/app
node scripts/verify-compiled-startup.mjs --build-dir <absolute-built-folder> --output <absolute-result.json>
```

Use the approved existing verification runtime. The probe executes the actual popup and sidepanel bundles with empty storage and synthetic signed-out auth responses, requires real Retry/Open Genfeed controls and working cached Zod constructors, and rejects unexpected network or runtime errors. Preserve the JSON and artifact hashes. This checks compiled startup; installed Brave, CSP, session and live backend acceptance remain separate.

2. **Load in Brave manually**
   - Use the local Genfeed Brave profile already signed into Genfeed.
   - Open Brave's extensions page, enable Developer mode and load `apps/extensions/browser/app/build/chrome-mv3-dev`.
   - For an existing installation, reload the same unpacked folder to preserve its extension ID and storage.
   - Browser automation cannot open the extensions management page; installation requires this manual handoff.

3. **Verify the signed-in session and workspace**
   - Open the side panel from the existing web session; verify the account and active organization.
   - Use the visible organization and brand selectors. Same-label organizations show their slug to distinguish them.
   - Confirm Library assets belong to the selected brand. An empty Library is valid; real-asset acceptance requires an existing accessible asset.
   - Switching organization/brand clears conversation, voice, attachments and scoped capture/import state. A same-scope focus refresh pauses actions and retains drafts.
   - Test cookie logout, an expired JWT, 403 denial, offline/503 recovery and Retry without reinstalling. API keys remain pinned to their verified organization.
   - No paid generation is needed for session/Library acceptance. Capture save and Library browsing do not start generation.
   - Record the exact commit and observed outcomes without copying credentials. Source tests/build alone do not close #5858 or #4340; installed Brave acceptance and the parent release gates remain required.

## Library search and manual attachment acceptance

- Reload the same local unpacked folder; the new downloads permission may require approval in Brave.
- In a ready workspace, search for metadata/prompt text absent from the asset title and for an asset beyond the first 24 items. Verify Load more, error Retry, and deduplication.
- Select image, GIF, video and audio references. Search and close/reopen the picker; selections should remain. Same-workspace refresh pauses actions and retains the draft. A real workspace/brand change clears the scoped selections and draft.
- Click Download for a current asset, choose its save location, and verify the message says only that the download started. Use the platform’s attachment button to manually attach the saved file to an authorized draft. Do not publish or start paid generation.
- Click Open asset separately and verify it opens the refreshed current asset URL. Denied/cancelled downloads must never open a tab automatically. Changed/deleted asset versions require removing and selecting the current Library item.
- Check narrow widths (320px/440px), dark/light themes, duplicate-click prevention and failure recovery. Record commit, selected workspace, asset kind, platform and observed outcome without URLs/credentials.
- Fixtures and builds do not prove installed Brave download, native attachment or generation acceptance; #5857 and #4340 remain open until their remaining gates have evidence.

## Own publication recording: bounded X home, Post dialog and Reply dialog acceptance

- Reload the same unpacked build. In Settings, confirm **Record my published posts** starts on, the selected organization/brand is correct, and the account label displays the organization without an opaque user ID. Existing explicit off preferences stay off.
- The observer covers the X `/home` inline text composer, a standalone zero-article Post dialog, and a text Reply dialog opened by the user's trusted click on an exactly identified article's Reply button. A direct-loaded Reply dialog has no parent intent and stays unconfirmed. Media-only posts, inline/detail reply editors, quote composers, keyboard-only submit, other X entry points and other platform adapters remain open under #4344. The extension records the user's publication; it does not publish it.
- Reply modal and acknowledgement must bind within 30 seconds. Compose for up to 10 minutes from clicking Reply; publication correlation runs for 60 seconds after submit. Expiry never resubmits or edits the native draft.
- When the user chooses to publish an authorized text post themselves, observe **Waiting for publication**, then **Recording published post**. Within 60 seconds, one newly appeared own post must match the exact full text, own handle, new status ID, timestamp and primary permalink. For Reply, bind the original article's numeric permalink before the dialog opens; the dialog's parent article and Replying-to labels do not establish identity. The own successful reply must have a different new ID. Quotes must contribute none of the parent post's identity/text. Own actor changes, ambiguous dialogs/headers, changed nodes, delayed intent acknowledgement or a submit race fail closed. Closing before submit cancels the intent; allowed return navigation after submit retains the original correlation window. A transformed/truncated or ambiguous post stays unconfirmed.
- After the backend is deployed, verify exactly one scoped Genfeed post with the original full text, date, URL and own external ID. Check original source on replay and honest missing-credential/analytics state. **Already in Genfeed** is a valid idempotent replay; no provider-verified badge or parent linkage is implied by client observation. Audience remains unknown for all three surfaces, even if Everyone is visible.
- Before backend rollout or during offline/server failure, confirm the recording stays in Settings with Retry/Dismiss and its original date. Retry is explicit, uses the original organization/brand and a fresh verified session, and never resubmits the native post. A duplicate content callback does not retry a failed record.
- For local storage failure, the visible **Retry recording** button resends the exact frozen observation even after 60 seconds. Focus does not retry. If session recovery succeeds, Settings can recover it after worker suspension or tab closure. The warning states that it is not saved for durable retry; both storage writes failing leave only memory while the tab/runtime remain alive. Browser shutdown may lose session-only recovery.
- Toggle off disables Retry and cancels unconfirmed discovery while preserving confirmed recovery. Switch scope/logout: old previews/actions disappear immediately; another tab/scope cannot join an in-flight callback. Switch back to recover the original scoped record. Dismiss is explicit; confirmed observations have no age cutoff.
- Fixtures are reconstructed sanitized structures from read-only DOM inspection. Mocked trust classification, storage and API tests do not prove a browser-trusted click, an installed publication or production persistence. Record exact installed commit and genuine user-originated outcome separately. Independent other-lab review, current-head CI, merge/deployment and installed acceptance remain delivery gates; source completion does not close #4344/#4340.

Run all tests and typechecks through `ssh mac-studio-2022`, in the assigned isolated Studio verification checkout:

```bash
cd apps/extensions/browser/app
bunx vitest run
bunx tsc --noEmit -p tsconfig.json
```

Compare pristine-input and final TypeScript diagnostics in the identical dependency/package-built environment. Retain both raw logs and require zero new normalized signatures or count growth; inherited nonzero diagnostics remain explicit. The prior 47/28 receipt is environment/input-specific, not an invented baseline. MacBook is restricted to formatting/lint/build.

## Platform Testing Checklist

### Twitter/X (twitter.com, x.com)

**Setup:**

- Navigate to https://x.com
- Find any tweet
- Click on the tweet to open the reply section

**Tests:**

- [ ] GenFeed dropdown button appears near the reply button
- [ ] Clicking the dropdown shows "Rewrite Post" and "Generate Image" options
- [ ] AI reply button (sparkles icon) appears
- [ ] Clicking AI reply generates a response
- [ ] Generated reply is inserted into the reply textarea
- [ ] Save button (bookmark icon) appears
- [ ] Clicking save successfully saves the tweet
- [ ] Console shows no errors
- [ ] Buttons have correct styling and tooltips

**Expected Behavior:**

- Buttons appear near Twitter's native reply button
- Buttons use Twitter's color scheme (blue)
- Tooltips appear on hover

---

### YouTube (youtube.com)

**Setup:**

- Navigate to https://youtube.com
- Open any video
- Scroll to comments section
- Click "Reply" on any comment

**Tests:**

- [ ] GenFeed buttons appear in comment reply section
- [ ] AI reply generates contextual comment responses
- [ ] Generated reply is inserted into comment textarea
- [ ] Save button saves the video URL
- [ ] Buttons appear for both video comments and comment replies
- [ ] Console shows platform detected as "YouTube"

**Expected Behavior:**

- Buttons appear near YouTube's comment submit button
- Works with both top-level comments and replies
- Handles YouTube's lazy-loaded comment sections

---

### Instagram (instagram.com)

**Setup:**

- Navigate to https://instagram.com
- Open any post
- Click "Add a comment"

**Tests:**

- [ ] GenFeed buttons appear in comment section
- [ ] AI reply generates Instagram-style responses
- [ ] Generated reply is inserted into comment box
- [ ] Save button saves the Instagram post
- [ ] Works with both posts and reels
- [ ] Platform detection shows "Instagram"

**Expected Behavior:**

- Buttons appear near Instagram's post button
- Adapts to Instagram's dark/light themes
- Handles emoji input correctly

---

### Reddit (reddit.com)

**Setup:**

- Navigate to https://reddit.com
- Open any post
- Click "Reply" on a comment or post

**Tests:**

- [ ] GenFeed buttons appear in reply section
- [ ] Works on both old and new Reddit
- [ ] AI reply generates Reddit-appropriate responses
- [ ] Generated reply is inserted into markdown editor
- [ ] Save button saves Reddit posts
- [ ] Works with nested comment replies
- [ ] Platform detection shows "Reddit"

**Expected Behavior:**

- Buttons appear near Reddit's save/cancel buttons
- Works with Reddit's markdown editor
- Handles Reddit's threaded comments

---

### Facebook (facebook.com)

**Setup:**

- Navigate to https://facebook.com
- Open any post
- Click "Write a comment"

**Tests:**

- [ ] GenFeed buttons appear in comment section
- [ ] AI reply generates Facebook-style responses
- [ ] Generated reply is inserted into comment box
- [ ] Save button saves Facebook posts
- [ ] Works with both posts and shared content
- [ ] Platform detection shows "Facebook"

**Expected Behavior:**

- Buttons appear near Facebook's post button
- Handles Facebook's complex DOM structure
- Works with Facebook's contenteditable divs

---

### TikTok (tiktok.com)

**Setup:**

- Navigate to https://tiktok.com
- Open any video
- Click in the comment box

**Tests:**

- [ ] GenFeed buttons appear in comment section
- [ ] AI reply generates TikTok-appropriate responses
- [ ] Generated reply is inserted into comment box
- [ ] Save button saves TikTok videos
- [ ] Works with TikTok's real-time comment updates
- [ ] Platform detection shows "TikTok"

**Expected Behavior:**

- Buttons appear near TikTok's post button
- Handles TikTok's mobile-first design
- Works with TikTok's emoji picker

---

### LinkedIn (linkedin.com)

**Setup:**

- Navigate to https://linkedin.com
- Open any post
- Click "Comment" or "Add a comment"

**Tests:**

- [ ] GenFeed buttons appear in comment section
- [ ] AI reply generates professional, LinkedIn-appropriate responses
- [ ] Generated reply is inserted into comment box
- [ ] Save button saves LinkedIn posts
- [ ] Works with posts and articles
- [ ] Platform detection shows "LinkedIn"

**Expected Behavior:**

- Buttons appear near LinkedIn's post button
- Maintains professional tone
- Works with LinkedIn's rich text editor

---

## Cross-Platform Tests

### Authentication

- [ ] User stays authenticated across all platforms
- [ ] Token is properly stored and retrieved
- [ ] Extension handles token expiration gracefully

### UI Consistency

- [ ] Buttons have consistent appearance across platforms
- [ ] Tooltips work on all platforms
- [ ] Dark mode support works where applicable
- [ ] Hover effects are consistent

### Error Handling

- [ ] Gracefully handles network errors
- [ ] Shows appropriate error messages
- [ ] Doesn't break platform's native functionality
- [ ] Recovers from errors without page reload

### Performance

- [ ] Buttons inject within 1 second
- [ ] No noticeable performance impact
- [ ] Doesn't interfere with platform's scrolling
- [ ] Memory usage is reasonable

### Edge Cases

- [ ] Works when user is not logged into Genfeed
- [ ] Handles missing reply boxes gracefully
- [ ] Works with keyboard navigation
- [ ] Handles multiple tabs open simultaneously

---

## Testing Tools

### Browser Console Checks

Look for these log messages:

```
Genfeed Extension: Content script loaded on [URL]
Genfeed Extension: Detected platform - [Platform Name]
Genfeed: Injecting buttons for [Platform], post ID: [ID]
```

### Network Tab Checks

Verify these API calls:

- `POST https://api.genfeed.ai/posts/save` - Save posts
- `POST https://api.genfeed.ai/prompts/tweet` - Generate replies

### DOM Inspection

Verify these elements exist:

- `.genfeed-buttons` - Button container
- `.genfeed-dropdown` - GenFeed dropdown
- `.genfeed-btn` - Individual buttons

---

## Common Issues & Solutions

### Issue: Buttons Don't Appear

**Check:**

1. Extension is loaded and enabled
2. User is on a supported platform
3. Console shows platform detection
4. Submit button selector is correct

**Solution:**

- Refresh the page
- Check browser console for errors
- Verify platform selectors in `config.ts`

### Issue: AI Reply Doesn't Insert

**Check:**

1. Reply textarea selector is correct
2. API returns valid response
3. Textarea element is found

**Solution:**

- Inspect textarea element
- Update selector in `config.ts`
- Check API response in network tab

### Issue: Save Button Fails

**Check:**

1. User is authenticated
2. API endpoint is accessible
3. Post ID extraction is working

**Solution:**

- Check authentication status
- Verify post ID in console
- Test API endpoint manually

---

## Reporting Issues

When reporting issues, include:

1. **Platform**: Which platform the issue occurred on
2. **Browser**: Chrome/Edge version
3. **Console Logs**: Copy from browser console
4. **Network Logs**: Copy failed API calls
5. **Screenshots**: Show what's not working
6. **Steps to Reproduce**: Exact steps to recreate issue

---

## Automated Testing (Future)

### Unit Tests

- Platform configuration validation
- Post ID extraction logic
- URL construction

### Integration Tests

- Button injection
- API communication
- Authentication flow

### E2E Tests

- Full user workflows
- Cross-platform scenarios
- Error recovery

---

**Testing Status**: Manual testing required for all platforms

**Last Updated**: 2025-10-09

**Tester**: **\*\***\_\_\_**\*\***

**Date**: **\*\***\_\_\_**\*\***

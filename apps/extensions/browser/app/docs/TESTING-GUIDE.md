# Multi-Platform Extension Testing Guide

## Pre-Testing Setup

1. **Build the Extension**

   ```bash
   cd extension.genfeed.ai
   pnpm run build
   ```

2. **Load in Browser**
   - Open Chrome/Edge
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `build/chrome-mv3-prod` folder

3. **Authenticate**
   - Click the extension icon
   - Log in with your Genfeed account
   - Verify authentication is successful

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

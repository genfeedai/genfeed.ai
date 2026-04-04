# Multi-Platform Support

## Overview

The Genfeed Extension now supports multiple social media platforms, allowing you to reply to people across the web using AI-powered responses.

## Supported Platforms

1. **Twitter/X** - twitter.com, x.com
2. **YouTube** - youtube.com
3. **Instagram** - instagram.com
4. **Reddit** - reddit.com
5. **Facebook** - facebook.com
6. **TikTok** - tiktok.com
7. **LinkedIn** - linkedin.com

## Architecture

### Platform Configuration System

The extension uses a modular platform configuration system located in `src/platforms/config.ts`. Each platform has:

- **Hostnames**: List of domains where the platform is active
- **Selectors**: CSS selectors for key UI elements (post containers, reply boxes, action buttons)
- **Post ID Extraction**: Platform-specific logic to extract post/comment IDs
- **URL Construction**: Logic to build URLs to specific posts

### UI Helpers

Located in `src/platforms/ui-helpers.ts`, this module provides:

- **Global Styles**: Consistent styling across all platforms
- **Button Creation**: Factory functions for creating buttons
- **Icons**: SVG icons for all actions
- **Dropdown Menus**: Contextual actions for posts

### Content Script

The content script (`src/content.ts`) automatically:

1. Detects the current platform
2. Injects platform-appropriate buttons
3. Observes DOM changes to inject buttons dynamically
4. Handles platform-specific interactions

### Background Script

The background script (`src/background.ts`) handles:

- **Post Saving**: Save posts from any platform to Genfeed
- **AI Reply Generation**: Generate contextual replies based on platform
- **Authentication**: Manage user authentication across platforms

## Features

### Available on All Platforms

1. **AI Reply Generation** (Sparkles button)
   - Generates contextual replies based on post content
   - Adapts tone and style to the platform
   - Automatically fills the reply/comment box

2. **Post Saving** (Bookmark button)
   - Save interesting posts to Genfeed for later
   - Organize content across platforms
   - Access saved posts from the extension popup

3. **GenFeed Dropdown** (Logo button)
   - Rewrite Post: Improve or rewrite post content
   - Generate Image: Create images based on post content

## Platform-Specific Behavior

### Twitter/X

- Injects buttons next to the tweet reply button
- Uses Twitter's native styling
- Extracts tweet IDs from URLs and DOM

### YouTube

- Injects buttons in comment sections
- Works with both video comments and replies
- Extracts video IDs and comment IDs

### Instagram

- Injects buttons in post comment sections
- Supports both posts and reels
- Extracts post IDs from URLs

### Reddit

- Works on both old and new Reddit
- Injects buttons in comment sections
- Supports post comments and nested replies

### Facebook

- Injects buttons in post comment sections
- Handles Facebook's complex DOM structure
- Extracts post IDs from various formats

### TikTok

- Injects buttons in video comment sections
- Supports video posts
- Extracts video IDs from URLs

### LinkedIn

- Injects buttons in post and article comment sections
- Works with LinkedIn's feed structure
- Extracts activity URNs

## Usage

1. **Install the Extension**

   ```bash
   pnpm install
   pnpm run dev  # For development
   pnpm run build  # For production
   ```

2. **Load in Browser**
   - Open Chrome/Edge Extensions page
   - Enable "Developer mode"
   - Load unpacked extension from `build/chrome-mv3-dev` (dev) or `build/chrome-mv3-prod` (prod)

3. **Use on Supported Platforms**
   - Navigate to any supported platform
   - Look for the GenFeed buttons near reply/comment sections
   - Click to use AI features

## Development

### Adding a New Platform

1. Add platform configuration to `src/platforms/config.ts`:

```typescript
newplatform: {
  name: 'New Platform',
  hostnames: ['newplatform.com', 'www.newplatform.com'],
  selectors: {
    postContainer: '.post-container',
    actionsContainer: '.actions',
    replyTextarea: 'textarea.reply',
    submitButton: 'button.submit',
    postIdentifier: '.post',
  },
  extractPostId: (element) => {
    // Platform-specific ID extraction logic
  },
  constructPostUrl: (postId: string) => {
    return `https://newplatform.com/post/${postId}`;
  },
}
```

2. Add hostname to `package.json` manifest:

```json
"host_permissions": [
  "https://*.newplatform.com/*"
]
```

3. Test on the platform and adjust selectors as needed

### Testing

1. **Local Testing**
   - Use `pnpm run dev` to start development mode
   - Load the extension in Chrome
   - Navigate to test platforms
   - Check browser console for logs

2. **Platform-Specific Testing**
   - Each platform may have different DOM structures
   - Test button injection and functionality
   - Verify AI reply insertion works correctly

## Known Issues & Limitations

1. **Dynamic Content**: Some platforms use highly dynamic content that may require multiple DOM observations
2. **Rate Limiting**: Some platforms may rate-limit API requests
3. **Authentication**: Users must be logged into both Genfeed and the target platform
4. **Selector Changes**: Platform UI changes may break selectors (requires updates)

## Future Enhancements

1. **More Platforms**: Add support for more social media platforms
2. **Advanced Features**:
   - Thread summarization
   - Sentiment analysis
   - Auto-translation
3. **Customization**: User-configurable AI behavior per platform
4. **Analytics**: Track extension usage and performance

## API Integration

The extension communicates with the Genfeed API:

- **Endpoint**: `https://api.genfeed.ai`
- **Authentication**: JWT tokens via `authService`
- **Endpoints Used**:
  - `POST /posts/save` - Save posts
  - `POST /prompts/tweet` - Generate replies
  - `POST /ai/improve-tweet` - Improve content
  - `POST /ai/generate-image` - Generate images

## Troubleshooting

### Buttons Not Appearing

1. Check if the platform is supported
2. Verify extension permissions
3. Check browser console for errors
4. Try refreshing the page

### AI Reply Not Working

1. Check authentication status
2. Verify API connectivity
3. Check for rate limiting
4. Review console logs

### Platform Detection Issues

1. Clear extension data
2. Reload the extension
3. Check platform configuration

## Support

For issues or questions:

- Check browser console logs
- Review extension documentation
- Contact support@genfeed.ai

---

**Version**: 2.0.0  
**Last Updated**: 2025-10-09  
**Supported Platforms**: 7

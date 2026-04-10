# GenFeed Browser Extension (`extension.genfeed.ai`)

Plasmo-based extension that brings GenFeed's AI workflows to multiple social media platforms. Draft replies, schedule content, and capture context straight from the browser - across Twitter/X, YouTube, Instagram, Reddit, Facebook, TikTok, and LinkedIn.

## 🌐 Supported Platforms

- **Twitter/X** - Generate replies, save tweets, rewrite content
- **YouTube** - Reply to comments with AI assistance
- **Instagram** - Engage with posts and reels intelligently
- **Reddit** - Create thoughtful replies and save discussions
- **Facebook** - Interact with posts and comments
- **TikTok** - Respond to video comments
- **LinkedIn** - Craft professional responses

## ✨ Capabilities

- **AI-Powered Replies**: Generate contextual, platform-appropriate responses using GenFeed's AI
- **Content Saving**: Save interesting posts/comments from any platform to your GenFeed library
- **Content Enhancement**: Rewrite and improve existing content
- **Image Generation**: Create images based on post content
- **Cross-Platform**: Consistent experience across all supported social networks

## Setup

```bash
pnpm install
# Create .env file with your Clerk publishable key
echo "PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key_here" > .env
pnpm dev                # generates build/chrome-mv3-dev
```

Load `build/chrome-mv3-dev` in Chrome (Developer Mode → Load unpacked) during development.

### Environment Configuration

- **Development**: Extension connects to `local.genfeed.ai` for authentication
- **Production**: Extension connects to `genfeed.ai` for authentication
- **Dark Mode**: Enabled by default for better user experience
- **Invite Only**: App is currently in private beta - no sign up required

### Scripts

```bash
pnpm dev         # watch mode
pnpm build       # production build
pnpm lint
pnpm format
pnpm test        # unit tests (Vitest) when configured
```

## Architecture Notes

### Multi-Platform System

The extension uses a modular platform configuration system (`src/platforms/`):

- **Platform Config** (`config.ts`): Defines selectors, URL patterns, and ID extraction logic for each platform
- **UI Helpers** (`ui-helpers.ts`): Platform-agnostic button creation and styling
- **Content Script** (`content.ts`): Automatically detects platform and injects appropriate UI elements
- **Background Script** (`background.ts`): Handles API communication with platform context

### Services & Integration

- Shared services (`src/services`) mirror frontend service clients; keep contracts in sync
- Authentication uses JWT tokens synced across platforms
- Platform-specific post IDs and URLs handled automatically
- Events sent to Notifications service for live updates (port 3011)
- Consistent design tokens across all platforms

### Adding New Platforms

See [MULTI-PLATFORM-SUPPORT.md](./MULTI-PLATFORM-SUPPORT.md) for detailed documentation on:

- Platform configuration structure
- Selector requirements
- Testing guidelines
- Common issues and solutions

## Release Checklist

- Update pending store listing links and track completion in GitHub Issues/Project.
- Generate store assets (icons, screenshots, promo copy).
- Bump version in `package.json` and rerun `pnpm build`.
- Submit zipped build via Chrome Web Store dashboard (or BPP GitHub Action once configured).

## Documentation

- **[Multi-Platform Support Guide](./MULTI-PLATFORM-SUPPORT.md)** - Detailed platform configuration and development guide
- **[Testing Guide](./TESTING-GUIDE.md)** - Comprehensive testing checklist for all platforms
- **[Token Management](./TOKEN_MANAGEMENT.md)** - Authentication and token handling
- **[Service Refactor](./SERVICE_REFACTOR.md)** - Service architecture documentation

## Useful Links

- Docs: [`docs.genfeed.ai/extension`](https://docs.genfeed.ai/extension)
- API service: `../api.genfeed.ai`
- Notifications service: `../notifications.genfeed.ai`
- MCP quickstart: [`docs.genfeed.ai/mcp-quickstart`](https://docs.genfeed.ai/mcp-quickstart)
- Store listing: pending publication URL (track in GitHub project)
- Mobile app listing: pending publication URL (track in GitHub project)

## Version History

### v2.0.0 (2025-10-09)

- ✨ Added multi-platform support (Twitter/X, YouTube, Instagram, Reddit, Facebook, TikTok, LinkedIn)
- 🏗️ Refactored to modular platform configuration system
- 🎨 Unified UI components across all platforms
- 📚 Comprehensive documentation and testing guides

### v1.0.0

- Initial release with Twitter/X support

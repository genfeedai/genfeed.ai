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
bun install
# Extension API traffic is direct (no Next.js /v1 proxy in the extension host).
# Auth still happens on the app origin so cookies match Studio.
echo "PLASMO_PUBLIC_API_ENDPOINT=https://api.genfeed.localhost/v1" > .env
bun run dev             # generates build/chrome-mv3-dev
```

Load `build/chrome-mv3-dev` in Brave (Developer Mode → Load unpacked) during development.

### Environment Configuration

- **Development authentication host**: `https://app.genfeed.localhost` (opens in the browser for sign-in / sign-up)
- **Development API host**: `https://api.genfeed.localhost/v1` via `PLASMO_PUBLIC_API_ENDPOINT` (extension background cannot use the app-origin `/v1` proxy)
- **Production**: Extension connects to `genfeed.ai` for authentication and API
- **Dark Mode**: Enabled by default for better user experience
- **Studio browser bundles** (contrast): app traffic stays on `https://app.genfeed.localhost/v1` so Better Auth cookies stay same-origin

### Scripts

```bash
bun run dev         # watch mode
bun run build       # production build
bun run lint
bun run format
bun run test        # unit tests (Vitest) when configured
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
- Events sent to `https://notifications.genfeed.localhost` for local live
  updates; container/deployed runtimes retain their internal notification port.
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
- Bump version in `package.json` and rerun `bun run build`.
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

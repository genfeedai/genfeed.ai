# Genfeed Mobile (`mobile.genfeed.ai`)

Expo/React Native application delivering Genfeed on the go—approvals, notifications, media previews, and soon lightweight editing.

## Capabilities

- Review and approve generated assets.
- Receive push notifications from the notifications service.
- View queues, analytics snapshots, and recent activity.
- (Planned) Trigger quick edits and share assets directly from mobile.

## Setup

```bash
bun install
cp .env.example .env        # configure API + Notifications endpoints, feature flags
bun run start              # choose iOS simulator, Android emulator, or Expo Go
```

### Scripts

```bash
bun run lint        # eslint
bun run test        # jest/vitest (configure as needed)
bun run build       # expo export (if configured)
```

## Architecture Notes

- Uses Expo Router (file-based navigation under `app/`).
- Service layer will mirror frontend packages; keep API calls centralised.
- Socket.io integration planned for live updates from `notifications.genfeed.ai`.
- Authentication will use Clerk tokens, stored securely via Expo Secure Store.
- Design tokens should align with the frontend/mobile shared system.

## Current Focus (September 2025)

- Wire Clerk authentication + token refresh.
- Implement approvals queue with optimistic actions.
- Integrate Socket.io notifications + Expo push notifications.
- Add offline caching for queued actions and media previews.

## Useful Links

- Docs placeholder: [`docs.genfeed.ai/mobile`](https://docs.genfeed.ai/mobile)
- API service: `../api.genfeed.ai`
- Notifications service: `../notifications.genfeed.ai`
- MCP quickstart: [`docs.genfeed.ai/mcp-quickstart`](https://docs.genfeed.ai/mcp-quickstart)
- Browser extension: `../extension.genfeed.ai` (shared flows)
- App store listings (placeholders):
  - [`Apple App Store`](https://apps.apple.com/app/idTBD)
  - [`Google Play`](https://play.google.com/store/apps/details?id=TBD)

Update this README as the mobile app expands beyond approvals.

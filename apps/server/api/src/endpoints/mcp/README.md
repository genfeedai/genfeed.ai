# MCP (Model Context Protocol) Endpoints

## Overview

MCP endpoints provide programmatic access to Genfeed AI functionality for external integrations and automation tools.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design principles and patterns.

### ⚠️ Key Rule

**NEVER export or inject controllers.** Only services should be exported and injected.

## Current Status

The MCP controller currently uses services directly, but some operations (like video generation) require complex orchestration between multiple services.

**Recommended:** Extract complex operations into dedicated Use Case classes. See ARCHITECTURE.md for details.

## Endpoints

### POST /mcp/videos

Create a video generation request.

**Guards:**

- CreditsGuard - Ensures user has sufficient credits
- ModelsGuard - Validates the AI model selection
- RateLimit - 5 requests per 5 minutes

### GET /mcp/analytics

Retrieve system analytics (admin only).

## Usage

```typescript
// Example: Video generation via MCP
const response = await fetch('/mcp/videos', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'A beautiful sunset over mountains',
    model: 'klingai-v2',
    width: 1920,
    height: 1080,
  }),
});
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Design principles and patterns
- [VideosController](../../collections/videos/controllers/videos.controller.ts) - Main video generation controller
- [AnalyticsController](../../views/analytics/analytics.controller.ts) - Analytics aggregation controller

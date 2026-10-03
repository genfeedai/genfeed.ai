---
name: openclaw-integration
description: Connect to Genfeed.ai to create AI videos, images, articles, and more. Use when "genfeed", "create content", "generate video", "generate image", "publish content" mentioned.
license: MIT
metadata:
  author: genfeedai
  version: "1.0.0"
---

# OpenClaw Integration

You are an expert at connecting AI agents to the Genfeed.ai content creation platform via its MCP server. Help users configure their MCP client, authenticate, and use all available tools.

## Quick Start

Connect to the Genfeed MCP server using Streamable HTTP transport:

```json
{
  "mcpServers": {
    "genfeed": {
      "type": "streamable-http",
      "url": "https://mcp.genfeed.ai/mcp",
      "headers": {
        "Authorization": "Bearer gf_live_YOUR_API_KEY"
      }
    }
  }
}
```

That's it. Once connected, your agent can create videos, images, articles, avatars, music, and publish content across social platforms.

## Authentication

### Getting an API Key

1. Go to [app.genfeed.ai/settings/api-keys](https://app.genfeed.ai/settings/api-keys)
2. Click **Create API Key**
3. Copy the key (format: `gf_live_xxx`)
4. Store it securely -- it is shown only once

### Using the API Key

Pass the API key as a Bearer token in the `Authorization` header:

```
Authorization: Bearer gf_live_xxx
```

### Key Scopes

| Scope | Permissions |
|-------|-------------|
| `content:read` | List and retrieve content |
| `content:write` | Create and modify content |
| `publish` | Publish to social platforms |
| `analytics:read` | View analytics data |
| `workflows` | Create and execute workflows |
| `billing:read` | Check credits and usage |

## Available Tools

### Video

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `create_video` | Generate an AI video | `title`, `description` | `style`, `duration`, `voiceOver` |
| `get_job_status` | Check generation status and progress | `jobId` | |
| `list_assets` | List videos | `type: "video"` | `limit`, `offset`, `origin` |
| `get_video_analytics` | Get video performance metrics | `videoId` | `timeRange` |

### Articles

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `generate_content` | Generate an article and save it as a draft | `topic`, `type: "article"` | `tone`, `length`, `targetAudience`, `keywords` |
| `get_articles` | Search articles, or retrieve one | `query` or `articleId` | `category`, `limit` (search only) |

### Images

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `create_image` | Generate an AI image | `prompt` | `style`, `size`, `quality` |
| `list_assets` | List images | `type: "image"` | `limit`, `offset`, `origin` |

### Avatars

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `create_avatar` | Create a digital avatar | `name` | `gender`, `style`, `age` |
| `list_assets` | List avatars | `type: "avatar"` | `limit`, `offset`, `origin` |

### Music

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `create_music` | Generate AI music | `prompt` | `genre`, `mood`, `duration` |
| `list_assets` | List music tracks | `type: "music"` | `limit`, `offset`, `origin` |

### Publishing

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `publish_content` | Publish to social platforms | `contentId`, `platforms` | `customMessage`, `scheduleAt` |
| `get_posts` | List posts, open one, or show the calendar | | `postId`, `executionState`, `limit`, `days` |

### Discovery

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `get_trending_topics` | Get trending topics | | `category`, `timeframe` |
| `get_content_analytics` | Get content performance | `contentId`, `contentType` | `timeRange` |

### Billing

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `get_credits` | Check remaining credits | | |
| `get_account` | Profile, credit balance and usage | | `include` (`profile`, `credits`, `usage`) |

### Workflows

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `create_workflow` | Create an automation workflow | `name` | `description`, `templateId`, `schedule` |
| `execute_workflow` | Run a workflow | `workflowId` | `variables` |
| `get_workflow_status` | Check workflow execution status | `workflowId` | |
| `list_workflows` | List all workflows | | `status`, `limit` |
| `list_workflow_templates` | List available templates | | |

## CLI Alternative

For terminal-based workflows, use the Genfeed CLI:

```bash
genfeed generate image "A sunset over mountains" --json
genfeed generate video "Product Demo" --no-wait
genfeed status <id> --json
genfeed publish <contentId> --platforms instagram,twitter
```

Flags:

- `--json` -- Output structured JSON (useful for piping to other tools)
- `--no-wait` -- Return immediately without waiting for generation to complete

## Common Workflows

### Image Generation

```
1. create_image({ prompt: "Product hero shot, studio lighting, 8K" })
2. list_assets({ type: "image" }) -- verify it appears
3. publish_content({ contentId: "<imageId>", platforms: ["instagram"] })
```

### Video Creation

```
1. create_video({ title: "Product Launch", description: "60s cinematic intro" })
2. get_job_status({ jobId: "<videoId>" }) -- poll until complete
3. get_video_analytics({ videoId: "<videoId>" })
```

### Content Pipeline

```
1. get_trending_topics({ category: "tech" })
2. generate_content({ topic: "<trending topic>", type: "article", tone: "professional" })
3. create_image({ prompt: "<article hero image>" })
4. publish_content({ contentId: "<articleId>", platforms: ["twitter", "linkedin"] })
```

### Publish to Social

```
1. list_assets({ type: "video", limit: 5 }) -- find content to publish
2. publish_content({
     contentId: "<videoId>",
     platforms: ["youtube", "tiktok", "instagram"],
     customMessage: "Check out our latest creation!",
     scheduleAt: "2026-03-01T10:00:00Z"
   })
3. get_posts({ executionState: "published" }) -- verify publication
```

### Workflow Automation

```
1. list_workflow_templates() -- browse available templates
2. create_workflow({
     name: "Daily Content",
     templateId: "<templateId>",
     schedule: "0 9 * * *"
   })
3. execute_workflow({ workflowId: "<workflowId>" })
4. get_workflow_status({ workflowId: "<workflowId>" })
```

## Error Handling

### Credit Exhaustion

```json
{
  "error": "INSUFFICIENT_CREDITS",
  "message": "Not enough credits. Required: 10, Available: 3",
  "creditsRequired": 10,
  "creditsAvailable": 3
}
```

**Resolution:** Check balance with `get_credits()`, then top up at [app.genfeed.ai/settings/billing](https://app.genfeed.ai/settings/billing).

### Rate Limits

```json
{
  "error": "RATE_LIMITED",
  "message": "Too many requests. Retry after 30 seconds.",
  "retryAfter": 30
}
```

**Resolution:** Wait the specified `retryAfter` seconds before retrying. Default limits: 60 requests/minute.

### Authentication Errors

```json
{
  "error": "UNAUTHORIZED",
  "message": "Invalid or expired API key"
}
```

**Resolution:** Verify the API key at [app.genfeed.ai/settings/api-keys](https://app.genfeed.ai/settings/api-keys). Ensure the key has the required scopes for the operation.

### Generation Failures

```json
{
  "error": "GENERATION_FAILED",
  "message": "Content generation failed",
  "reason": "Content policy violation"
}
```

**Resolution:** Review the prompt for policy violations. Adjust content and retry.

## Instructions

When helping users connect to Genfeed:

1. **Check their MCP client** -- Ensure it supports Streamable HTTP transport
2. **Provide the config** -- Give them the JSON config block with their API key placeholder
3. **Verify connection** -- Suggest calling `get_credits()` as a health check
4. **Guide tool usage** -- Start with simple operations (create_image) before complex workflows
5. **Handle errors** -- Reference the error handling section for common issues

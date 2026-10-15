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

Use `find_tools` to inspect this connection's available tools and full input schemas.
Call `get_account` and `get_brands` to verify access without generating or publishing.
Resolve a brand before generation; never invent an identifier or select the first brand implicitly.

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `find_tools` | Discover capabilities or inspect one schema | | `query`, `name`, `toolset` |
| `get_account` | Read profile, credits, and usage | | `include` |
| `get_brands` | List brands or read one | | `brand` |
| `get_generation_options` | List models, settings, and credit estimates | | `type`, `modelKey`, `brandId` |
| `generate` | Generate image, video, voice, or music | `type`, `prompt`, `brandId` | Type-specific settings from discovery |
| `get_job_status` | Read a generation's progress and result | `jobId` | |
| `list_assets` | List media or characters | `type` | `brandId`, `limit`, `offset`, `origin` |
| `generate_content` | Generate article drafts or social copy | `topic`, `type`, `brandId` | `tone`, `length`, `platform`, `keywords` |
| `get_articles` | Search articles or retrieve one | `query` or `articleId` | `category`, `limit` (search only) |
| `get_trends` | Find current topic ideas | | `category`, `timeframe` |
| `get_video_analytics` | Read video performance | `videoId` | `timeRange` |
| `get_content_analytics` | Read content performance | `contentId`, `contentType` | `timeRange` |
| `create_post` | Save a text draft | | Discover the accepted draft fields |
| `get_posts` | Read posts or the calendar | | `postId`, `executionState`, `limit`, `days` |
| `list_brand_publishing_readiness` | Read connected channels and credentials | `brandId` | |
| `get_scheduler_capabilities` | Read channel publishing constraints | | `platform` |
| `validate_scheduler_target` | Check a proposed channel target | `platform` | `credentialId`, `caption`, `media`, `settings` |
| `create_scheduled_release` | Create a draft or scheduled release | `release` with title, baseContent, timezone, targets | `idempotencyKey` |
| `get_scheduled_release` | Inspect release state | `releaseId` | |
| `control_scheduled_release` | Pause, resume, cancel, or publish now | `releaseId`, `action` | |
| `create_workflow` | Create an automation workflow | `label` | Discover current workflow fields |
| `execute_workflow` | Run a saved workflow | `workflowId` | `variables`, `nodeIds`, `respectLocks` |
| `get_workflow_status` | Read saved workflow status | `workflowId` | |
| `list_workflows` | List saved workflows | | `status`, `limit` |
| `list_workflow_templates` | List available templates | | |

Tool text is readable display content. Use `structuredContent.data` for identifiers
and follow-up inputs. Errors and pending approvals keep their code and references
in `structuredContent`. Do not parse display messages as JSON.

## CLI Alternative

For terminal workflows, inspect the installed CLI with `genfeed --help` and use
its documented commands. CLI commands and MCP tool names are separate interfaces.

## Common Workflows

### Image or Video Generation

1. Read the account and brands; ask the user to select a brand when needed.
2. Read generation options for the requested type and resolve a supported model.
3. Obtain an estimate with the chosen model and settings, and confirm the intended spend.
4. Call `generate` with `type: "image"` or `type: "video"`, the prompt, and resolved `brandId`.
5. If approval is pending, show the review link and wait for the user's decision.
6. After execution, use the returned job identifier with `get_job_status`; render the returned media.

### Content Pipeline

1. Call `get_trends` for topic evidence when available.
2. Draft reviewed copy with `generate_content`, using the resolved brand and requested content type.
3. Generate a supporting visual only when the user requested and approved that generation.
4. Save a draft or continue through the publishing workflow after explicit confirmation.

### Publish to Social

1. Resolve the brand and connected credential with `get_brands` and `list_brand_publishing_readiness`.
2. Check `get_scheduler_capabilities` and `validate_scheduler_target` for the exact caption, media, and channel settings.
3. Confirm the exact content, destination, and time with the user.
4. Call `create_scheduled_release` with a release containing `title`, `baseContent`, `timezone`, and `targets` with the verified `credentialId` and `platform`.
5. Inspect its state with `get_scheduled_release`. For a confirmed immediate publication, use `control_scheduled_release` with `action: "publish-now"`.
6. If approval is pending, show its review link and wait. Never claim a queued approval published anything.

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

**Resolution:** Check balance with `get_account` with `include: ["credits"]`, then top up at [app.genfeed.ai/settings/billing](https://app.genfeed.ai/settings/billing).

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
3. **Verify connection** -- Suggest calling `get_account` as a read-only connection check
4. **Guide tool usage** -- Start with read-only discovery and a requested image generation before complex workflows
5. **Handle errors** -- Reference the error handling section for common issues

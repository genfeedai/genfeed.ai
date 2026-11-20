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
Call `get_context` with `action` set to `account`, then `brands`, to verify access without generating or publishing.
Resolve a brand before generation; never invent an identifier or select the first brand implicitly.

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `find_tools` | Discover capabilities or inspect one schema | | `query`, `name`, `toolset` |
| `get_context` | Read the account (profile, credits, usage), brands, organizations and brand context | `action` (`account`, `brands`, `organizations`, `brand_context`, `brand_completeness` or `brand_scan_status`) | `input` holds the original parameters, such as `include` or `brand` |
| `get_generation_catalog` | List models, settings and credit estimates, presets and the visual-code catalog | `action` (`options`, `presets`, `preset`, `storyboard_capabilities`, `visual_code_catalog` or `visual_code_quote`) | `input` holds the original parameters, such as `type`, `modelKey` and `brandId` for `options` |
| `generate` | Generate image, video, voice, or music | `type`, `prompt`, `brandId` | Type-specific settings from discovery |
| `check_job` | Read the progress and result of a generation, 3D model, visual project or workflow run | `action` (`job`, `model3d`, `visual_code_project`, `workflow_run` or `workflow_status`) | `input` holds the original parameters, such as `jobId` for `job` |
| `get_assets` | List media or characters | `type` | `brandId`, `limit`, `offset`, `origin` |
| `generate_content` | Generate article drafts or social copy | `topic`, `type`, `brandId` | `tone`, `length`, `platform`, `keywords` |
| `get_insights` | Read trends, content and video performance, LinkedIn analytics and performance analysis | `action` (`overview`, `content`, `video`, `linkedin`, `performance` or `trends`) | `input` holds the original parameters, such as `videoId` and `timeRange` |
| `save_post` | Save a text draft, an article draft or a campaign, or link a tracked post | `action` (`post`, `article`, `campaign` or `track_link`) | `input` holds the original parameters; discover the accepted draft fields |
| `get_content` | Read posts and the calendar, scheduled releases, articles and article previews | `action` (`posts`, `release`, `articles` or `article_preview`) | `input` holds the original parameters, such as `postId`, `executionState`, `limit`, `days`, `releaseId`, `articleId` or `query` |
| `check_channel` | Read channel constraints, validate a proposed target, read a brand's connected channels and their health, or check an account connection | `action` (`capabilities`, `validate`, `readiness`, `connection_status` or `linkedin_connection`) | `input` contains original channel parameters; `input.platform` is required for validate and `input.brandId` for readiness |
| `schedule_release` | Create or update a draft or scheduled release | `action` (`create` or `update`) | `input` holds `release` with title, baseContent, timezone and targets, and `idempotencyKey` |
| `control_release` | Pause, resume, cancel or publish a release now, or publish an article | `action` (`control` or `publish`) | `input` holds `releaseId` and its own `action` |
| `manage_workflow` | Create, duplicate, install, schedule or run a workflow, or build an ad or Instagram remix workflow | `action` (`create`, `duplicate`, `install`, `schedule`, `execute`, `create_ad_remix` or `create_instagram_remix`) | `input` holds the original parameters, such as `label`, `workflowId`, `variables`, `nodeIds` and `respectLocks`; `execute` spends credits |
| `find_workflows` | List saved workflows, templates, the system catalog, runs and one workflow | `action` (`list`, `templates`, `catalog`, `runs` or `inspect`) | `input` holds the original parameters, such as `status` and `limit` |

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
6. After execution, use the returned job identifier with `check_job` (`action` set to `job`); render the returned media.

### Content Pipeline

1. Call `get_insights` with `action` set to `trends` for topic evidence when available.
2. Draft reviewed copy with `generate_content`, using the resolved brand and requested content type.
3. Generate a supporting visual only when the user requested and approved that generation.
4. Save a draft or continue through the publishing workflow after explicit confirmation.

### Publish to Social

1. Resolve the brand and connected credential with `get_context` (`action: brands`) and `check_channel` (`action: readiness`).
2. Call `check_channel` with `action: capabilities`, then `action: validate` with the exact platform, caption, media, and channel settings in `input`.
3. Confirm the exact content, destination, and time with the user.
4. Call `schedule_release` with `action: create` and, in `input`, a release containing `title`, `baseContent`, `timezone`, and `targets` with the verified `credentialId` and `platform`.
5. Inspect its state with `get_content` (`action: release`). For a confirmed immediate publication, use `control_release` with `action: control` and `input.action: "publish-now"`.
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

**Resolution:** Check balance with `get_context` with `action: "account"` and `input: { include: ["credits"] }`, then top up at [app.genfeed.ai/settings/billing](https://app.genfeed.ai/settings/billing).

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
3. **Verify connection** -- Suggest calling `get_context` with `action` set to `account` as a read-only connection check
4. **Guide tool usage** -- Start with read-only discovery and a requested image generation before complex workflows
5. **Handle errors** -- Reference the error handling section for common issues

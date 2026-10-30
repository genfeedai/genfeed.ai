# OpenClaw Integration

Connect AI agents to the Genfeed.ai content creation platform via MCP.

## Installation

```bash
npx skills add genfeedai/skills/openclaw-integration
```

## Usage

Ask your agent to connect to Genfeed:

```
Connect to Genfeed and create an image of a mountain sunset
```

```
Use Genfeed to generate a product demo video
```

```
Publish my latest video to Instagram and TikTok
```

```
Check my Genfeed credit balance
```

## What It Does

This skill teaches AI agents how to connect to the Genfeed.ai MCP server and use all 24 available tools for content creation, publishing, and analytics.

It covers:

- **MCP Configuration** -- Streamable HTTP transport setup at `https://mcp.genfeed.ai/mcp`
- **Authentication** -- API key setup with Bearer token auth
- **24 tools** -- Video, image, article, avatar, music creation + publishing + analytics + workflows
- **CLI fallback** -- `genfeed` CLI for terminal workflows
- **Error handling** -- Credit exhaustion, rate limits, auth errors

## Quick Setup

Add this to your MCP client config:

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

Get your API key at [app.genfeed.ai/settings/api-keys](https://app.genfeed.ai/settings/api-keys).

## Available Tools

Use `find_tools` to discover the connected account's tools and input schemas.

| Tool | Description |
|------|-------------|
| `get_account` | Read profile, credits, and usage as a readable message |
| `get_brands` | Resolve the brand for the task |
| `get_generation_options` | Read supported models and credit estimates |
| `generate` | Generate image, video, voice, or music for an approved request |
| `generate_content` | Generate article drafts or social copy |
| `list_assets` | List media and named characters |
| `get_job_status` | Read generation progress and results |
| `get_articles` | Search articles or retrieve one |
| `get_posts` | Read posts or the content calendar |
| `get_trends` | Discover topic ideas |
| `get_content_analytics` | Read content performance |
| `get_video_analytics` | Read video performance |
| `create_scheduled_release` | Create a draft or scheduled multi-channel release |
| `get_scheduled_release` | Read release execution state |
| `control_scheduled_release` | Pause, resume, cancel, or publish a confirmed release |
| `create_workflow` | Create an automation workflow |
| `execute_workflow` | Run a saved workflow |
| `get_workflow_status` | Read saved workflow status |

Before generating, resolve a brand and confirm the requested spend. Before publishing,
resolve a verified channel, check scheduler capabilities, validate the target, and
confirm the exact content and time. Pending approvals require the user's decision.
See [the complete workflow](./SKILL.md).

Tool text is for display; identifiers and complete results remain in structured
fields for follow-up calls. A readable account lookup is the connection check;
no generation or publication is needed to test access.

## CLI Alternative

Run `genfeed --help` to inspect the installed CLI. Its commands are separate from
MCP tool names.

## License

MIT

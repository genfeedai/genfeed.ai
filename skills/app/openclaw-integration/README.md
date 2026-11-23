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
| `get_context` | Read the account, resolve the brand for the task, and read brand context |
| `get_generation_catalog` | Read supported models, credit estimates and presets |
| `generate_media` | Generate image, video, voice, or music for an approved request |
| `generate_text` | Generate article drafts or social copy |
| `get_assets` | List media and named characters |
| `check_job` | Read generation progress and results |
| `get_content` | Read posts, the content calendar, releases and articles |
| `get_insights` | Discover topic ideas and read content and video performance |
| `schedule_release` | Create or update a draft or scheduled multi-channel release |
| `control_release` | Pause, resume, cancel, or publish a confirmed release |
| `manage_workflow` | Create, duplicate, install, schedule or run a workflow |
| `find_workflows` | List saved workflows, templates and runs |

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

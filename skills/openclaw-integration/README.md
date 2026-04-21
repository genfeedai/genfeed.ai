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

### Content Creation

| Tool | Description |
|------|-------------|
| `create_video` | Generate AI videos |
| `create_image` | Generate AI images |
| `create_article` | Generate AI articles |
| `create_avatar` | Create digital avatars |
| `create_music` | Generate AI music |

### Content Management

| Tool | Description |
|------|-------------|
| `list_videos` | List all videos |
| `list_images` | List all images |
| `list_avatars` | List all avatars |
| `list_music` | List all music tracks |
| `search_articles` | Search articles |
| `get_article` | Retrieve an article |
| `get_video_status` | Check video progress |

### Publishing

| Tool | Description |
|------|-------------|
| `publish_content` | Publish to social platforms |
| `list_posts` | List published posts |

### Analytics

| Tool | Description |
|------|-------------|
| `get_video_analytics` | Video performance metrics |
| `get_content_analytics` | Content performance metrics |
| `get_trending_topics` | Discover trending topics |
| `get_credits` | Check credit balance |
| `get_usage_stats` | Usage statistics |

### Workflows

| Tool | Description |
|------|-------------|
| `create_workflow` | Create automation workflows |
| `execute_workflow` | Run a workflow |
| `get_workflow_status` | Check workflow status |
| `list_workflows` | List all workflows |
| `list_workflow_templates` | Browse workflow templates |

## Example

```
> Connect to Genfeed and create a product hero image

Agent connects to MCP server, calls create_image with an optimized prompt,
and returns the generated image URL.
```

## CLI Alternative

```bash
genfeed generate image "A sunset over mountains" --json
genfeed generate video "Product Demo" --no-wait
genfeed publish <id> --platforms instagram,twitter
```

## License

MIT

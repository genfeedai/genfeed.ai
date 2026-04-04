# @genfeedai/cli

[![npm version](https://img.shields.io/npm/v/@genfeedai/cli.svg)](https://www.npmjs.com/package/@genfeedai/cli)
[![CI](https://github.com/genfeedai/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/genfeedai/cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```
   ___            __             _    ___ _    ___
  / __|___ _ _   / _|___ ___ ___| |  / __| |  |_ _|
 | (_ / -_) ' \ |  _/ -_) -_) -_) | | (__| |__ | |
  \___\___|_||_||_| \___\___\___|_|  \___|____|___|

  > What image | video do you want to create? _
```

CLI tool for [Genfeed.ai](https://genfeed.ai) - Generate, schedule, analyze, and publish AI content from your terminal.

## Last Verified

- **Date:** 2026-03-04
- **Implemented state source:** local `cli/` commands and package metadata
- **Delivery state source:** GitHub issues/project metadata

## Dual-State Note

- **Implemented state:** command behavior documented here should match `src/commands/*`.
- **Delivery state:** roadmap/priority comes from GitHub Issues/Projects, not this README.

## Requirements

- Node.js 18+
- A [Genfeed.ai](https://genfeed.ai) account with API access

## Installation

Using bun (recommended):

```bash
bun add -g @genfeedai/cli
```

Using npm:

```bash
npm install -g @genfeedai/cli
```

## Quick Start

Login with your API key:

```bash
genfeed login
```

Generate an image:

```bash
genfeed generate image "A futuristic cityscape at sunset"
```

Generate a video:

```bash
genfeed generate video "A drone flying over mountains"
```

## Authentication

Get your API key from the [Genfeed.ai dashboard](https://app.genfeed.ai/settings/api-keys).

Interactive login:

```bash
genfeed login
```

Non-interactive login:

```bash
genfeed login --key gf_live_xxx
```

Check current user:

```bash
genfeed whoami
```

Logout:

```bash
genfeed logout
```

## Commands

### Brand Management

List all brands:

```bash
genfeed brands
```

Select active brand:

```bash
genfeed brands select
```

Show current brand:

```bash
genfeed brands current
```

### Image Generation

Basic generation:

```bash
genfeed generate image "Your prompt here"
```

With options:

```bash
genfeed generate image "Your prompt" --model imagen-4 --width 1920 --height 1080 --output ./image.jpg
```

Don't wait for completion:

```bash
genfeed generate image "Your prompt" --no-wait
```

### Video Generation

Basic generation:

```bash
genfeed generate video "Your prompt here"
```

With options:

```bash
genfeed generate video "Your prompt" --model google-veo-3 --duration 10 --resolution 1080p --output ./video.mp4
```

### Article Generation

Generate an article:

```bash
genfeed generate article "Write about AI marketing trends" --category marketing
```

Generate long-form X article:

```bash
genfeed generate article-x "Write a founder update thread"
```

Start async and poll later:

```bash
genfeed generate article "Your prompt" --no-wait
genfeed status <article-id> --type article
```

### Check Status

Check image status:

```bash
genfeed status <id>
```

Check video status:

```bash
genfeed status <id> --type video
```

Check article status:

```bash
genfeed status <id> --type article
```

### Agent Chat

Start the interactive Genfeed agent shell:

```bash
genfeed chat
genfeed chat --thread <thread-id>
genfeed chat --model claude-3-7-sonnet
```

Send one non-interactive agent turn for Claude/OpenAI/OpenClaw-style tool use:

```bash
genfeed chat send "Plan a launch week content sequence" --json
genfeed chat send --thread <thread-id> --stdin < prompt.txt
genfeed chat send "Review this draft" \
  --attachment '{"url":"https://cdn.genfeed.ai/example.png","kind":"image"}' \
  --json
```

Answer a pending input request on an existing thread:

```bash
genfeed threads respond <thread-id> "Use the more technical angle" --json
```

### Batch Generation

```bash
genfeed batch create -n 5 -p twitter,linkedin --topics ai,product --style professional
genfeed batch list
genfeed batch show <batch-id>
genfeed batch approve <batch-id>
```

### Templates

```bash
genfeed template list
genfeed template create --label "LinkedIn Hook" --purpose prompt --content "Write a hook about {{topic}}"
genfeed template use <template-id> --variables '{"topic":"AI workflows"}'
```

### Scheduling and Insights

```bash
genfeed schedule calendar
genfeed insights
genfeed insights times --platform twitter
genfeed performance weekly
genfeed credits summary
genfeed posts list --platform twitter --status published
```

### Darkroom (Admin)

Check GPU health:

```bash
gf darkroom health
```

Manage ComfyUI service:

```bash
gf darkroom comfy status
gf darkroom comfy restart
```

List available LoRA models:

```bash
gf darkroom loras
```

### Training (Admin)

Start LoRA training:

```bash
gf train <handle> --steps 2000 --wait
```

Check training status:

```bash
gf train status <jobId> --watch
```

### Datasets (Admin)

View dataset info:

```bash
gf dataset info <handle>
```

Upload training images:

```bash
gf dataset upload <handle> ./images/
```

Download dataset:

```bash
gf dataset download <handle> ./output/
```

### Captioning (Admin)

Run Florence-2 auto-captioning on a dataset:

```bash
gf caption <handle>
gf caption <handle> --trigger "custom_trigger"
```

## Options

### Global Options

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON (for scripting) |
| `--help` | Show help |
| `--version` | Show version |

### Generation Options

| Option | Description |
|--------|-------------|
| `-m, --model <model>` | Model to use |
| `-b, --brand <id>` | Override active brand |
| `-o, --output <path>` | Download to file |
| `--no-wait` | Don't wait for completion |

### Image-specific Options

| Option | Description |
|--------|-------------|
| `-w, --width <px>` | Image width |
| `-h, --height <px>` | Image height |

### Video-specific Options

| Option | Description |
|--------|-------------|
| `-d, --duration <sec>` | Video duration |
| `-r, --resolution <res>` | Resolution (720p, 1080p, 4k) |

## Scripting

Use `--json` for machine-readable output:

Get image URL:

```bash
URL=$(genfeed generate image "prompt" --json | jq -r '.url')
```

Check status programmatically:

```bash
STATUS=$(genfeed status abc123 --json | jq -r '.status')
```

## Agent Integration

The Genfeed CLI is designed for use by AI agents and automation tools.

### Non-Interactive Authentication

```bash
genfeed login --key $GENFEED_API_KEY
```

### JSON Output

All commands support `--json` for machine-readable output:

```bash
genfeed generate image "A sunset over mountains" --json
genfeed generate video "Product demo" --json
genfeed brands --json
```

### Async Operations

Use `--no-wait` to get an ID immediately without waiting for completion:

```bash
# Start generation and get ID
ID=$(genfeed generate image "prompt" --no-wait --json | jq -r '.id')

# Poll for completion
genfeed status $ID --json
```

### Agent Usage Example

```bash
# Authenticate
genfeed login --key gf_live_xxx

# Generate an image
RESULT=$(genfeed generate image "Professional headshot, studio lighting" --json)
IMAGE_ID=$(echo $RESULT | jq -r '.id')

# Check status
genfeed status $IMAGE_ID --json

# Publish to social media
genfeed publish $IMAGE_ID --platforms twitter,linkedin --json
```

### External LLM Tooling Example

```bash
# One-shot agent turn from an external model/tool runner
genfeed chat send "Generate 3 LinkedIn post ideas for our AI launch" --json

# Continue the same thread on the next tool call
genfeed chat send --thread thread_123 "Turn idea 2 into a full post" --json

# Resolve a structured follow-up question from the agent
genfeed threads respond thread_123 "Target early-stage SaaS founders" --json
```

### MCP Server

For richer integration, connect directly to the Genfeed MCP server:

```
Endpoint: https://mcp.genfeed.ai/mcp
Transport: Streamable HTTP
Auth: Bearer token (API key)
```

See the [MCP documentation](https://mcp.genfeed.ai/v1/docs) for details.

## Configuration

Config is stored in `~/.gf/config.json`:

```json
{
  "activeProfile": "default",
  "profiles": {
    "default": {
      "apiUrl": "https://api.genfeed.ai/v1",
      "role": "user",
      "darkroomHost": "100.106.229.81",
      "darkroomApiPort": 8189,
      "agent": {
        "model": "claude-3-7-sonnet",
        "lastThreadIdByOrganization": {}
      },
      "defaults": {
        "imageModel": "imagen-4",
        "videoModel": "google-veo-3"
      }
    }
  }
}
```

### Environment Variable Overrides

| Variable | Description |
|----------|-------------|
| `GENFEED_API_KEY` | API key |
| `GENFEED_API_URL` | API base URL |
| `GENFEED_TOKEN` | Auth token |
| `GENFEED_ORGANIZATION_ID` | Organization ID |
| `GENFEED_USER_ID` | User ID |
| `GENFEED_AGENT_MODEL` | Default agent model for `chat` / `chat send` |
| `GF_DARKROOM_HOST` | Darkroom GPU host IP |
| `GF_DARKROOM_PORT` | Darkroom API port |

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT

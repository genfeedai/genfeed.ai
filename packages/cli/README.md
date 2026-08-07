# @genfeedai/cli

[![npm version](https://img.shields.io/npm/v/@genfeedai/cli.svg)](https://www.npmjs.com/package/@genfeedai/cli)
[![CI](https://github.com/genfeedai/genfeed.ai/actions/workflows/ci.yml/badge.svg)](https://github.com/genfeedai/genfeed.ai/actions/workflows/ci.yml)
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

- **Date:** 2026-08-06
- **Implemented state source:** local `packages/cli/` commands and package metadata
- **Delivery state source:** GitHub issues/project metadata

## Dual-State Note

- **Implemented state:** command behavior documented here should match `src/commands/*`.
- **Delivery state:** roadmap/priority comes from GitHub Issues/Projects, not this README.

## Monorepo Location

The CLI lives in `packages/cli` inside the `genfeedai/genfeed.ai` monorepo. It is part of the root `packages/*` workspace and uses the same Turbo build, lint, test, and type-check flow as the other shared packages.

Root-level commands:

```bash
bun run build:cli
bun run test:cli
bun run type-check:cli
bun run dev:cli -- --help
```

Package-level commands:

```bash
bun run --cwd packages/cli build
bun run --cwd packages/cli test
bun run --cwd packages/cli type-check
```

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

Browser login (opens `https://app.genfeed.ai/oauth/cli` and completes a PKCE flow):

```bash
genfeed login
```

Non-interactive login with an API key from the [Genfeed.ai dashboard](https://app.genfeed.ai/settings/api-keys) — also the path for self-hosted deployments:

```bash
genfeed login --key gf_live_xxx
```

Paste a key manually instead of opening a browser:

```bash
genfeed login --interactive
```

Self-hosted login — point the browser flow at your own deployment:

```bash
genfeed login --api-url https://api.yourdomain.com/v1
```

Both URLs are saved to the active profile, so subsequent commands target the same deployment. The
web app URL serving `/oauth/cli` is derived from the API URL (`api.` → `app.`, or the API origin
when the API is path-mounted). Override it when your app lives somewhere else:

```bash
genfeed login --api-url https://yourdomain.com/api/v1 --app-url https://studio.yourdomain.com
```

The same values are settable outside login via `genfeed config set api-url <url>` /
`genfeed config set app-url <url>`, or the `GENFEED_API_URL` / `GENFEED_APP_URL` env vars.
`genfeed config show` prints the resolved app URL and marks it `(derived)` when it was inferred.

Check current user:

```bash
genfeed whoami
```

Logout:

```bash
genfeed logout
```

## Commands

### API Keys

List, create, rotate, and revoke API keys for headless and MCP access:

```bash
genfeed keys list
genfeed keys create -n "CI publisher" -p content
genfeed keys rotate <id>
genfeed keys revoke <id>
```

`create` takes a scope preset via `-p` (`mcp`, `read`, `content`, `full`) or an explicit `--scopes` list, plus optional `--expires-at`, `--rate-limit`, and `--allow-ip`. The secret is printed once, on creation and on rotation.

### CLI Configuration

Inspect and edit the active profile:

```bash
genfeed config show
genfeed config path
genfeed config set api-url http://localhost:3010/v1
genfeed config reset --force
```

Settable keys: `agent-model`, `api-key`, `api-url`, `brand`, `fleet-host`, `fleet-port`, `org-id`, `persona`, `role`.

### Organizations

List your organizations:

```bash
gf organizations
```

Switch the active organization (also updates the default brand):

```bash
gf organizations select
```

Show the current organization:

```bash
gf organizations current
```

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

Generate several at once, steered by keywords:

```bash
genfeed generate article "Write about AI marketing trends" --count 3 --keywords ai,marketing,seo
```

Generate long-form X article:

```bash
genfeed generate article-x "Write a founder update thread" --tone analytical --words 3000
```

Article generation is synchronous — the command returns the finished articles, so
there is nothing to poll. To re-read one later:

```bash
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

### Article-specific Options

Articles resolve their brand from the API key's own context, and generation is
synchronous — neither `--brand` nor `--no-wait` applies.

| Option | Description |
|--------|-------------|
| `-c, --count <n>` | Number of standard articles (1-4) |
| `--category <cat>` | Article category |
| `--keywords <list>` | Comma-separated keywords |
| `--tone <tone>` | Tone of voice (`article-x` only) |
| `--words <n>` | Target word count, 2500-10000 (`article-x` only) |
| `--no-header-image` | Skip the header image (`article-x` only) |

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
      "appUrl": "https://app.genfeed.ai",
      "role": "user",
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
| `GENFEED_APP_URL` | Web app URL serving `/oauth/cli` (derived from `GENFEED_API_URL` when unset) |
| `GENFEED_TOKEN` | Auth token |
| `GENFEED_ORGANIZATION_ID` | Organization ID |
| `GENFEED_USER_ID` | User ID |
| `GENFEED_AGENT_MODEL` | Default agent model for `chat` / `chat send` |

## Contributing

Contributions are welcome! Please see the monorepo [CONTRIBUTING.md](https://github.com/genfeedai/genfeed.ai/blob/master/CONTRIBUTING.md) for guidelines.

## License

MIT

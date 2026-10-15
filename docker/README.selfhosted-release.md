# Genfeed.ai Community __RELEASE_TAG__

This bundle runs the public Genfeed.ai Community image
`ghcr.io/genfeedai/genfeed.ai:__IMAGE_TAG__` with PostgreSQL and embedded Redis.

Compose selects the published `linux/amd64` image. On Apple Silicon or another
ARM host, enable AMD64 emulation in your Docker runtime before starting.

## Install

```bash
cp .env.example .env
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml up -d
```

The web UI is available at `http://localhost:3000`, the API at
`http://localhost:3010`, and MCP at `http://localhost:3014`.

Before generating, edit `.env` and set `OPENROUTER_API_KEY` to a real key from
<https://openrouter.ai/keys>; text generation and the agent need it, and the
readiness check reports text generation as not ready without it. Use real keys
only: Settings validates each provider key with the provider, so placeholders are
rejected. Restart with the same `up -d` command after editing `.env`.

Sign-up is on by default: open the web UI and create your account. Edit `.env`
before starting if the default ports conflict, or to turn the login wall off
(`BETTER_AUTH_ENABLED=false` and `NEXT_PUBLIC_BETTER_AUTH_ENABLED=false`). See the complete self-hosting
guide at <https://github.com/genfeedai/genfeed.ai/blob/__RELEASE_TAG__/docs/self-hosting.md>.

## Stop

```bash
docker compose --env-file .env -f compose.yml down
```

Add `-v` only when you intentionally want to delete the local database and
Genfeed data volumes.

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

Uncomment and fill `OPENROUTER_API_KEY` in `.env` to enable text generation;
without it the first generation fails with "Missing provider key". After editing
`.env`, run `up -d` again (a plain restart does not re-read it).

Edit `.env` before starting if the default ports conflict or you want to enable
the optional local login wall and integrations. See the complete self-hosting
guide at <https://github.com/genfeedai/genfeed.ai/blob/__RELEASE_TAG__/docs/self-hosting.md>.

## Stop

```bash
docker compose --env-file .env -f compose.yml down
```

Add `-v` only when you intentionally want to delete the local database and
Genfeed data volumes.

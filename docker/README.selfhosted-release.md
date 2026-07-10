# Genfeed.ai Community __RELEASE_TAG__

This bundle runs the public Genfeed.ai Community image
`ghcr.io/genfeedai/genfeed.ai:__IMAGE_TAG__` with PostgreSQL and embedded Redis.

## Install

```bash
cp .env.example .env
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml up -d
```

The web UI is available at `http://localhost:3000`, the API at
`http://localhost:3010`, and MCP at `http://localhost:3014`.

Edit `.env` before starting if the default ports conflict or you want to enable
the optional local login wall and integrations. See the complete self-hosting
guide at <https://github.com/genfeedai/genfeed.ai/blob/__RELEASE_TAG__/docs/self-hosting.md>.

## Stop

```bash
docker compose --env-file .env -f compose.yml down
```

Add `-v` only when you intentionally want to delete the local database and
Genfeed data volumes.

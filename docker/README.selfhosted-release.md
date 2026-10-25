# Genfeed.ai Community __RELEASE_TAG__

This bundle runs the public Genfeed.ai Community image
`ghcr.io/genfeedai/genfeed.ai:__IMAGE_TAG__` with PostgreSQL and embedded Redis.

Compose selects the published `linux/amd64` image. On Apple Silicon or another
ARM host, enable AMD64 emulation in your Docker runtime before starting.

## Install

Use Docker Engine 28+ with the Docker Compose v2 plugin, or Docker Desktop.

```bash
cp .env.example .env
# Before starting: set OPENROUTER_API_KEY in .env using your editor.
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml up -d
```

The web UI is available at `http://localhost:3000`, the API at
`http://localhost:3010`, WebSocket at `http://localhost:3011/socket.io/`, and MCP
at `http://localhost:3014`. Keep port 3011 reachable from the browser on the
same machine for live agent chat and follow-up turns; it binds to `127.0.0.1`
only because the socket process also serves other notification routes.

`SELFHOSTED_WS_PORT` overrides the socket's host port only (default `3011`).
The browser endpoint is built into the image as `http://localhost:3011`; a
different host port requires a proxy at that endpoint or a custom image built
with a matching `NEXT_PUBLIC_WS_ENDPOINT` build argument. A runtime `.env`
change alone does not update the browser endpoint.

The API and WebSocket host ports bind to `127.0.0.1` only. The Docker Engine 28+
minimum supports this loopback isolation. Keep the login wall enabled before
exposing the API through a reverse proxy. Internal Docker-network access is
unchanged.

Before starting, edit `.env` and set `OPENROUTER_API_KEY` to a real key from
<https://openrouter.ai/keys>; text generation and the agent need it, and the
container now exits before starting services without it. Use real keys
only: Settings validates each provider key with the provider, so placeholders are
rejected. Restart with the same `up -d` command after editing `.env`.

Alternatively, `npx @genfeedai/create my-genfeed` asks for the key with hidden
input and a domain, then writes a private `.env` before starting Docker. For
non-interactive setup use `--yes` with `OPENROUTER_API_KEY` supplied securely
through the environment; `SELFHOSTED_DOMAIN` is optional. Never put a key in
command arguments or commit the generated file.

Set `SELFHOSTED_DOMAIN=studio.example.com` for a domain you own, or leave it
blank for localhost. The domain derives HTTPS app/API/auth URLs and trusted
origins. Configure DNS, TLS and a reverse proxy: the domain's `/v1/*` reaches
the API (port 3010), `/mcp` reaches MCP (3014), and other app requests reach
port 3000. The wizard does not provision DNS, certificates or a proxy. Explicit
public/auth URL overrides must agree; public-domain installs with localhost
auth or trusted origins stop with a configuration error. Local host port
overrides `SELFHOSTED_APP_PORT`, `SELFHOSTED_API_PORT`, `SELFHOSTED_MCP_PORT`
are retained by the wizard. Internal container ports do not change.

## Upgrade warning for 0.2.15

Existing installs with an empty or placeholder `OPENROUTER_API_KEY` now stop
booting. Configure a real key before upgrading, including seeded single-user
installs. To use the domain setting, remove old localhost public/auth overrides
from `.env` (or leave them blank); startup validation refuses mixed origins.
Key validation checks configuration format only; successful provider access,
signup and the first agent turn must still be verified on your installation.

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

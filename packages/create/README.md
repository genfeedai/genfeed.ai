# @genfeedai/create

Install a checksummed Genfeed.ai Community release with Docker Compose.

## Quick Start

```bash
npx @genfeedai/create my-genfeed
```

The installer resolves the latest GitHub release, downloads its public
self-hosted bundle, verifies the SHA-256 checksum and release manifest, then
starts the exact GHCR image associated with that release. The app is available
at `http://localhost:3000`.

Install a specific release reproducibly:

```bash
npx @genfeedai/create my-genfeed --release v0.5.0
```

Prepare and validate the installation without starting containers:

```bash
npx @genfeedai/create my-genfeed --release v0.5.0 --no-start
```

Node.js 24 (`>=24 <25`; other versions exit with an error), Docker Compose v2, and `tar` must be installed. The generated directory
contains the release manifest, pinned environment, Compose file, and
installation guide.

## First sign-up and first generation

Sign-up is enabled by default: open `http://localhost:3000` and create your
account. To generate text, set a real `OPENROUTER_API_KEY` in the generated
`.env` (create one at [openrouter.ai/keys](https://openrouter.ai/keys)) and
re-run `docker compose --env-file .env -f compose.yml up -d`. Without it the
readiness check reports text generation as not ready. Use real keys only:
Settings validates each provider key before saving it, so placeholders are
rejected.

## License

AGPL-3.0

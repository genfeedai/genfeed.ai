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

Node.js 24, Docker Compose, and `tar` must be installed. The generated directory
contains the release manifest, pinned environment, Compose file, and
installation guide.

## License

AGPL-3.0

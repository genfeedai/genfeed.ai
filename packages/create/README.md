# @genfeedai/create

Install a checksummed Genfeed.ai Community release with Docker Compose.

## Quick Start

```bash
npx @genfeedai/create my-genfeed
```

The installer resolves the latest GitHub release, downloads its public
self-hosted bundle, verifies the SHA-256 checksum and release manifest, then
starts the exact GHCR image associated with that release. The app is available
at `http://localhost:3000` by default. The wizard asks for an OpenRouter key
(hidden input) and a domain you own (blank for localhost). It writes the final
`.env` with owner-only permissions and generated encryption/session secrets
before starting Docker.

Install a specific release reproducibly:

```bash
npx @genfeedai/create my-genfeed --release v0.5.0
```

Prepare and validate the installation without starting containers:

```bash
npx @genfeedai/create my-genfeed --release v0.5.0 --no-start
```

Node.js 24 or newer (`>=24`; older versions exit with an error), Docker Compose v2, and `tar` must be installed. The generated directory
contains the release manifest, pinned environment, Compose file, and
installation guide.

## First sign-up and first generation

Sign-up is enabled by default. Supply a real key from
[openrouter.ai/keys](https://openrouter.ai/keys) during setup: missing or
placeholder keys stop installation/startup. Format checks do not prove provider
access or available provider credit.

For automation, pass `--yes` and securely provide `OPENROUTER_API_KEY` in the
environment. `SELFHOSTED_DOMAIN` and the three `SELFHOSTED_*_PORT` variables
override the defaults; no secret CLI argument is supported. Non-terminal input
requires `--yes` and a key, rather than silently copying an unusable template.

A domain such as `studio.example.com` derives HTTPS app/API/auth URLs and trusted
origins. You must configure DNS, TLS and reverse-proxy routing separately; the
release bundle README describes it. Existing installs upgrading to 0.2.15 must
configure a key before restarting and remove conflicting localhost auth URLs
when setting a domain.

## License

AGPL-3.0

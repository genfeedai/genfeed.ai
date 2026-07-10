# Contributing to Genfeed.ai

Contributions to the open-source tree are welcome through pull requests to
`master`, the repository's single trunk.

## Before you start

- Read [SECURITY.md](SECURITY.md) before reporting a vulnerability.
- Search existing issues and pull requests to avoid duplicate work.
- Open an issue before a large or cross-cutting change so maintainers can confirm
  the scope.
- Do not include credentials, `.env` files, customer data, or generated build
  artifacts.

## Toolchain

- Node.js `>=24 <25`
- Bun `1.3.14`
- Docker Engine with Docker Compose v2, or Docker Desktop, when running
  PostgreSQL/Redis or the Community distribution

This is a Bun workspace. Do not use npm, Yarn, or pnpm to install repository
dependencies or update `bun.lock`.

## Development setup

```bash
git clone https://github.com/<your-account>/genfeed.ai.git
cd genfeed.ai
bun install
cp .env.example .env.local
```

Edit `.env.local` before generating workspace env files. At minimum, align the
database credentials with `docker/local/docker-compose.yml`:

```env
DATABASE_URL=postgresql://genfeed:genfeed_local@localhost:5432/genfeed
REDIS_URL=redis://localhost:6379
```

Then sync and start the local dependencies:

```bash
bun run env:sync local --prune-legacy
docker compose -f docker/local/docker-compose.yml up -d postgres redis
```

Run only the workspaces needed for your change. Common entry points are:

```bash
bun run dev:app
bun run dev:essentials
bun run dev:desktop
bun run dev:docs
```

The self-hosted distribution has a separate container-image path that does not
require local Node.js or Bun. See [docs/self-hosting.md](docs/self-hosting.md).

## Branch and pull-request workflow

1. Fork the repository.
2. Create a short-lived branch from the latest `master`.
3. Make one focused change.
4. Run focused checks for the files and workspaces you changed.
5. Open a pull request against `genfeedai/genfeed.ai:master`.

External-fork CI is held until a maintainer reviews the patch and applies the
`run-ci` label. The pull-request template records the evidence maintainers need
for that review.

## Focused verification

Use package names from each workspace's `package.json`:

```bash
bunx biome check --write <changed-paths>
bunx turbo run lint --filter=@genfeedai/<workspace>
bunx turbo run type-check --filter=@genfeedai/<workspace>
bunx turbo run test --filter=@genfeedai/<workspace>
```

For a documentation-only change, use targeted Markdown checks when the affected
workspace provides them and always run:

```bash
git diff --check
```

Broad workspace builds and test suites run in GitHub Actions. In the pull
request, list exactly what you ran and any checks left to CI.

## Code standards

- Keep TypeScript strict; do not introduce `any` or inline shortcut interfaces.
- Use `@genfeedai/*` aliases instead of deep relative imports across packages.
- Keep response serializers in `packages/serializers`.
- Preserve single-tenant Community behavior and organization guards in shared
  API code.
- Use conventional commit subjects such as `feat:`, `fix:`, `docs:`, and
  `refactor:`.
- Match at least three existing examples before introducing a new code pattern.

## Repository boundaries

- `apps/` contains product, server, and client applications.
- `packages/` contains shared packages. Check each package's own metadata for
  its license and public API.
- `ee/` contains commercially licensed packages and is not part of the normal
  public contribution path. Do not include `ee/` changes unless a maintainer has
  explicitly requested them.
- Managed inference infrastructure, customer model assignments, and Fleet/LoRA
  operations are outside this public repository.

## Pull-request expectations

- Keep the patch single-purpose and split unrelated work.
- Link the issue with `Fixes #123` or `Refs #123`.
- Explain user-visible behavior and repository-boundary effects.
- Include focused verification commands and results.
- Call out generated files, migrations, configuration changes, and external
  settings that still need a maintainer action.

Integration utilities live in [packages/integrations](packages/integrations/README.md).
Release flows are documented in [RELEASING.md](RELEASING.md).

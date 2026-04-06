# Contributing to Genfeed.ai

Thank you for your interest in contributing to Genfeed.ai!

## Branch Strategy

| Branch | Purpose | Who can push |
|--------|---------|-------------|
| `develop` | Community contributions land here | PRs from anyone |
| `staging` | Pre-production testing | Maintainers only |
| `master` | Production — deploys to Genfeed Cloud | Maintainers only |

**Contributors:** Fork the repo and open PRs against `develop`.

**Maintainers:** Merge `develop` → `staging` → `master` when ready to deploy.

### CI for External Contributors

To prevent abuse, CI does not run automatically on PRs from forks. A maintainer must review the code and add the `run-ci` label before CI will execute.

## Getting Started

1. Fork the repository
2. Create a feature branch from `develop`
3. Make your changes
4. Run `bun run lint && bun run typecheck && bun run test`
5. Submit a pull request against `develop`

## Repository Structure

- `apps/` — Applications (API, web, admin, desktop, mobile, extensions)
- `packages/` — Shared packages (AGPL-3.0)
- `ee/` — Enterprise features (Commercial License — see `ee/LICENSE`)

## Code Standards

- TypeScript strict mode — no `any` types
- Use path aliases (`@genfeedai/*`) over relative imports
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`
- No secrets in code (`.env`, API keys, tokens)

## Contributing to Core (AGPL-3.0)

All code outside of `ee/` is licensed under AGPL-3.0. Contributions are welcome via pull request.

## Contributing to Enterprise (`ee/`)

Code in the `ee/` directory is under a commercial license. Contributing to `ee/` requires a Contributor License Agreement (CLA). Please contact us before submitting PRs to `ee/`.

## Adding Integrations

See `packages/integrations/README.md` for how to add new platform integrations.

## Adding AI Models

See `docs/adding-models.md` for the model integration pipeline.

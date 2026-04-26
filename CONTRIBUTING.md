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
4. Run the narrowest relevant checks for the packages you changed:
   - `npx biome check --write .`
   - `bunx turbo run lint --filter=<changed-package>`
   - `bunx turbo run type-check --filter=<changed-package>`
   - `bunx turbo run test --filter=<changed-package>`
   - Use the full repo baseline only when the change touches shared infrastructure or multiple packages.
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

## Pull Request Expectations

- Keep PRs small and single-purpose. Prefer under 500 changed lines and under 10 code files when the change can be split cleanly.
- Put a short summary at the top of the PR description, even when the diff is small.
- Link the related issue with `Fixes #123` or `Refs #123`.
- State what you tested. A short list of commands or flows is enough.
- Keep GitHub as the source of truth. If work started in chat or another private channel, copy the needed context into the issue or PR.

## Contributing to Core (AGPL-3.0)

All code outside of `ee/` is licensed under AGPL-3.0. Contributions are welcome via pull request.

## Contributing to Enterprise (`ee/`)

Code in the `ee/` directory is under a commercial license. Contributing to `ee/` requires a Contributor License Agreement (CLA).

Before submitting PRs to `ee/`:

1. Contact [cla@genfeed.ai](mailto:cla@genfeed.ai) to request the CLA
2. Sign and return the agreement
3. Wait for confirmation before opening your PR

Core contributions (outside `ee/`) do not require a CLA — your contribution is accepted under the AGPL-3.0 license.

## Adding Integrations

See `packages/integrations/README.md` for how to add shared platform integration utilities.

## Adding AI Models

See `docs/adding-models.md` for the model integration pipeline.

## Releasing

See [RELEASING.md](RELEASING.md) for the production, desktop, and browser-extension release flow.

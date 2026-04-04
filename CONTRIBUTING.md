# Contributing to Genfeed.ai

Thank you for your interest in contributing to Genfeed.ai!

## Repository Structure

- `apps/` — Applications (API, web, admin, desktop, mobile, extensions)
- `packages/` — Shared packages (AGPL-3.0)
- `ee/` — Enterprise features (Commercial License — see `ee/LICENSE`)

## Contributing to Core (AGPL-3.0)

All code outside of `ee/` is licensed under AGPL-3.0. Contributions are welcome via pull request.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `bun run lint && bun run typecheck && bun run test`
5. Submit a pull request

## Contributing to Enterprise (`ee/`)

Code in the `ee/` directory is under a commercial license. Contributing to `ee/` requires a Contributor License Agreement (CLA). Please contact us before submitting PRs to `ee/`.

## Code Standards

- TypeScript strict mode — no `any` types
- Use path aliases (`@genfeedai/*`) over relative imports
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`
- No secrets in code (`.env`, API keys, tokens)

## Adding Integrations

See `packages/integrations/README.md` for how to add new platform integrations.

## Adding AI Models

See `docs/adding-models.md` for the model integration pipeline.

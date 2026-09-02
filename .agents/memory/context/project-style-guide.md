# Style Guide — Genfeed.ai

**last_verified: 2026-07-26** · Delta only. Type safety, import order, serializers, soft deletes,
`ConfigService`, and the no-raw-HTML rule are stated once in CLAUDE.md — not repeated here.

- **Interfaces**: component props → `packages/props/`; state/helper shapes → `packages/contracts/src/interfaces/`
- **Commit types**: `fix:` `feat:` `refactor:` `chore:` `test:` `build:`
- **Formatting**: Biome 2.4.x, sorted keys on. `bunx biome check --write .` before committing
- **Naming**: agent tools `snake_case` · CSS `gen-*` · CSS vars `--gen-accent-*` · packages `@genfeedai/{name}`
- **Testing**: TDD — failing test first. Per package: `bun run test --filter=@genfeedai/[name]`

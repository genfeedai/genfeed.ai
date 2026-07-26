# NestJS: never `import type` a class consumed via decorator metadata

**last_verified: 2026-07-26** · Enforced by `bun run check:di-value-imports`
(`scripts/check-di-value-imports.ts`), an AST guard in the CI `guards` job

`apps/server/**` inherits `emitDecoratorMetadata` from `tsconfig.server.decorators.json`, which
writes each decorated signature's parameter classes into `design:paramtypes` as **runtime value
references**. `import type` erases the value, so the entry degrades to `undefined`/`Object`:

- **Constructor DI** — Nest resolves garbage or injects the wrong provider.
- **`@Body`/`@Query`/`@Param` DTOs** — ValidationPipe loses the metatype and **silently skips
  validation**; requests pass through unvalidated.

Both pass type-check and lint. No compiler flag catches it — the tsconfig is correct, the spelling
is wrong. Observed repeatedly (2026-07-06: a `brands.controller.ts` edit, plus `SkillsController`
and `MoodBoardsController` shipped with unvalidated `@Body()` DTOs).

## Rules

- In `apps/server/**`, classes used as **undecorated constructor params** or as **`@Body`/`@Query`/
  `@Param` DTO types** MUST be value imports.
- `import type` stays correct for interfaces (`AuthenticatedUser`), express `Request`/`Response`,
  `Socket`, and any param carrying an explicit token decorator (`@Inject(TOKEN)`, `@InjectQueue`).
- The deliberate cycle-breaking pattern (`import type` + `@Inject(SYMBOL)` + `useExisting`) is
  documented in `apps/server/api/src/collections/tasks/tasks.tokens.ts`.
- The global "prefer type-only imports" preference does **not** apply in these positions.

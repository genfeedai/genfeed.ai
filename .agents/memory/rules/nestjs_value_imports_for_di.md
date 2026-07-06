# NestJS server: never `import type` classes consumed via decorator metadata

**last_verified: 2026-07-06**

The server apps compile with `emitDecoratorMetadata` (root
`tsconfig.server.decorators.json`, extended by `apps/server/tsconfig.json`).
That flag emits each decorated signature's parameter classes into
`design:paramtypes` — as **runtime value references**. `import type` erases
the value, so the metadata entry degrades to `undefined`/`Object`:

- **Constructor DI**: Nest resolves garbage or boots with the wrong provider.
- **`@Body()`/`@Query()`/`@Param()` DTOs**: ValidationPipe loses the metatype
  and **silently skips validation** — requests pass through unvalidated.

Both failure modes **pass type-check and lint**; they only surface at runtime.
This is not a tsconfig bug — the config is correct; no compiler flag can catch
the wrong spelling. Observed repeatedly (brands.controller.ts working-tree
edit 2026-07-06; `SkillsController` + `MoodBoardsController` shipped with
unvalidated `@Body()` DTOs until the same day).

## Rules

- In `apps/server/**`: classes used as **undecorated constructor params** or as
  **`@Body`/`@Query`/`@Param` DTO types** MUST be value imports.
- `import type` IS correct (and preferred) for: interfaces (`AuthenticatedUser`),
  express `Request`/`Response`, `Socket`, and any constructor param that carries
  an explicit token decorator (`@Inject(TOKEN)`, `@InjectQueue`, …).
- The deliberate cycle-breaking pattern — `import type` + `@Inject(SYMBOL)` +
  `useExisting` provider — is documented in
  `apps/server/api/src/collections/tasks/tasks.tokens.ts`.
- The global "prefer type-only imports" TypeScript preference does **not**
  apply to these decorator-metadata positions.

## Enforcement

`bun run check:di-value-imports` (`scripts/check-di-value-imports.ts`) — AST
guard over `apps/server/**/*.ts`, runs in the CI `guards` job. It flags
type-only imports used as undecorated constructor param types or as `*Dto`
types on validated route params.

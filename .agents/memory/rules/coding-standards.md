---
description: Judgement-call coding standards for TypeScript and TSX: naming, component shape, UI composition, form spacing, test style. Review reads them; rules a tool can check live in the AGENTS.md Enforced Rules table.
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Coding standards (judgement calls)

A rule a tool can check becomes a check and a row in the `AGENTS.md` Enforced Rules table. This file holds what no tool can decide.

## Naming and components

- Booleans take an `is`/`has` prefix: `isActive`, `hasPermission`.
- Components use `function` declarations (not arrow) and a default export.

## UI composition

- Preserve semantic correctness in UI controls: navigation is a `Link`, an action is a `Button`.
- Controls come from `@ui/primitives/*`. For an unstyled control use `Button` with `variant={ButtonVariant.UNSTYLED}` and `withWrapper={false}`. Never nest a `Button` inside a `Button`; restructure them as siblings. `scripts/ui/control-guard.ts` blocks raw HTML controls.
- Form spacing has one owner per level. `Field` spaces label, control and error. `Form` (`@ui/primitives/form`, `spacing="default" | "section" | "none"`) spaces the fields. The `Modal` body and `DialogContent` space their blocks and footers. Put no vertical margin on a direct child of those stacks, or on `ModalActions`, `DialogHeader`, `DialogFooter`, `FormControl`, `Field` or `Label`; `control-guard.ts` fails on it.

## Tests

- Couple tests to public behavior (returned or persisted results, rendered output), not to internal call order or private structure. A correct refactor must not break a test.
- Assert what the user sees. In component tests query by role, label or text (`getByRole`, `getByLabelText`), not `getByTestId`.
- Keep logic out of tests: no loops, branches or re-implementation of the code under test. Use literal expected values or `it.each` tables.

# Prompt bar

## What exists
The shared generation composer used by the playground and other studio tools: a rich
prompt input with `@` reference mentions, a command list, model and setup controls, and a
submit action. Page object: `playwright/e2e/pages/studio.page.ts`.

## How a user reaches it
Open `/playground` (or any studio tool). The composer is docked at the bottom of the
workspace.

## How to drive it
Stable selectors:
- `getByTestId('studio-playground-prompt')` — the prompt input
- `getByTestId('studio-playground-composer-shell')` — the composer container
- `getByTestId('prompt-command-list')` — the slash/command popover

Specs: `playwright/e2e/tests/studio/reference-mentions-acceptance.spec.ts`,
`generation-setup-responsive.spec.ts`, `generation-spend.spec.ts`,
`playground-feedback-timing.spec.ts`.

## What usually breaks
- Typing into a contenteditable: use `fill`/keyboard on the testid element, not on a
  wrapper, or the mention popover never opens.
- Responsive layouts: setup controls collapse at narrow widths; assert at the project
  viewport (1280×720) unless the spec resizes.
- Submitting spends credits against a real provider; mock in verification runs.

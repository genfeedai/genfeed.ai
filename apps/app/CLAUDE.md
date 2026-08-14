# @genfeedai/app — Main Studio App

Next.js App Router. Next 16: the middleware file is `proxy.ts`, not `middleware.ts`. Tailwind v4 syntax only.

## Routing

- Route groups: `(protected)` (authed; org/brand-scoped work lives under `[orgSlug]/[brandSlug]/`), `(public)`, `(onboarding)`. Admin is `(protected)/admin`.
- New pages use the server/client split: `page.tsx` (server component: metadata + `Suspense` wrapper) + `content.tsx` (client component with the actual UI).
- Navigation uses `Link` semantics; actions use `Button` semantics.

## Component rules

- `function` declarations (not arrow), default export. Colocated `*.test.tsx`.
- Never raw HTML elements (`<button>`, `<input>`, `<table>`, …) — use `@ui/primitives/*`. Enforced by `scripts/ui/control-guard.ts` (pre-commit via lint-staged, and CI `check:ui-guards`). Unstyled usage: `Button` with `variant={ButtonVariant.UNSTYLED}` + `withWrapper={false}`. Never nest `Button` inside `Button` — restructure as siblings.
- Every `useEffect` with async calls uses an `AbortController`.
- Prop interfaces live in `packages/props/`, never inline.
- Card sizing via `size` prop; padding via `bodyClassName`. Premium surfaces use `gen-*` design classes.

## Verify

- Build: `bunx turbo run build --filter=@genfeedai/app`
- Tests: `bun run test --filter=@genfeedai/app`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

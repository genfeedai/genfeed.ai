# @genfeedai/app — Main Studio App

Next.js App Router. Next 16: the middleware file is `proxy.ts`, not `middleware.ts`. Tailwind v4 syntax only.

## Routing

- Route groups: `(protected)` (authed; org/brand-scoped work lives under `[orgSlug]/[brandSlug]/`), `(public)`, `(onboarding)`. Admin is `(protected)/admin`.
- New pages use the server/client split: `page.tsx` (server component: metadata + `Suspense` wrapper) + `content.tsx` (client component with the actual UI).
- Navigation uses `Link` semantics; actions use `Button` semantics.

## Component rules

- `function` declarations (not arrow), default export. Colocated `*.test.tsx`.
- Never raw HTML elements (`<button>`, `<input>`, `<table>`, …) — use `@ui/primitives/*`. Enforced by `scripts/lint-no-raw-html.sh` pre-commit. Unstyled usage: `Button` with `variant={ButtonVariant.UNSTYLED}` + `withWrapper={false}`. Never nest `Button` inside `Button` — restructure as siblings.
- Every `useEffect` with async calls uses an `AbortController`.
- Prop interfaces live in `packages/props/`, never inline.
- Card sizing via `size` prop; padding via `bodyClassName`. Premium surfaces use `gen-*` design classes.

## Verify

- Build: `bunx turbo run build --filter=@genfeedai/app`
- Tests: `bun run test --filter=@genfeedai/app`

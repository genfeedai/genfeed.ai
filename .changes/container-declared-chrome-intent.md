packages: @genfeedai/props

Replace `ContainerProps.forceModuleChrome` with `moduleChrome?: boolean`.
Container previously inferred its layout ("classic" vs `SectionTopbar` module
chrome) from whichever of `right` / `tabs` / `headerTabs` / `leading` happened
to be truthy on a given render, which flips a page's structure between its
loading, error, and loaded states whenever those props are populated
differently across them. `moduleChrome`, when a page sets it, decides the
layout outright and stays stable regardless of what's currently populated;
leaving it unset keeps the existing heuristic.

Also add `SectionTopbarProps.forceVisible?: boolean`. `Container` passes this
through when `moduleChrome` is explicitly declared, so the bar shell stays
mounted (instead of collapsing to a bare `sr-only` `h1`, and at the same
minimum height as a populated row) through a transient empty state.

`ContainerProps` is now a discriminated union rather than a plain interface:
`moduleChrome: false` cannot be combined with `tabs`/`headerTabs`, since
neither renders once the classic layout is forced — that combination is a
type error, not just a documented footgun. `packages/props/ui/ui.props.type-test.ts`
is a compile-only regression test for this guard (excluded from `vitest`,
picked up by `tsc --noEmit` only).

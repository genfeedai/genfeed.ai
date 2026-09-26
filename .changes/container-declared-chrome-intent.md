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
mounted (instead of collapsing to a bare `sr-only` `h1`) through a transient
empty state.

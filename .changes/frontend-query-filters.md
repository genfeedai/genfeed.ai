packages: @genfeedai/helpers, @genfeedai/pages, @genfeedai/props

List filters now live on the query string. `@genfeedai/helpers` exports
`createFilterHref` for changing one filter without dropping the rest.
Library browser props and `useLibraryBrowser` read place, shelf, and
categories from the URL, with route props as defaults only. `FilterPageProps`
is the shared search-params shape for those pages.

Old type-seeded Library paths still redirect to `/library/assets`. An
explicit `categories` query on that old path is kept; the path preset is
applied only when that key is absent.

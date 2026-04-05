# Surface System

Use the shared surface system to keep hierarchy clear across product and marketing UI.

## `Card`

Use [`Card.tsx`](/Users/decod3rs/www/genfeedai/cloud/packages/ui/card/Card.tsx) for compact, bounded objects:

- summary tiles
- entity cards
- navigation tiles
- small status bundles

Do not use `Card` as a page section wrapper for long forms, dense tables, or whole dashboard modules.

## `WorkspaceSurface`

Use [`WorkspaceSurface.tsx`](/Users/decod3rs/www/genfeedai/cloud/packages/ui/overview/WorkspaceSurface.tsx) for protected-product sections:

- dashboard modules
- titled panes
- filterable sections
- settings blocks
- mixed-content operational panels

Choose `tone` for emphasis and `density` for information rhythm. Default to framed sections unless the surrounding layout already supplies the shell.

## `AppTable`

Use [`Table.tsx`](/Users/decod3rs/www/genfeedai/cloud/packages/ui/display/table/Table.tsx) for dense, scannable data. Compose table sections with `WorkspaceSurface` instead of wrapping the table in a generic `Card`.

## Marketing Surfaces

`gen-card-spotlight` and `gen-card-featured` are reserved for website and marketplace layouts. They should feel related to the product surface system, but they are not the default product container.

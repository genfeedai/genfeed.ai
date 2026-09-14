packages: @genfeedai/helpers @genfeedai/pages @genfeedai/props

Add shared browser-storage helpers at `@genfeedai/helpers/data/storage/storage.helper`.
Raw item reads and writes preserve storage errors; string-array helpers return an
empty array or ignore a failed write for optional model preferences.

Move `EvalCellProps` from the page component to
`@genfeedai/props/posts/post-evaluation.props` and add an optional `presentation`
value of `table` or `grid`. Existing component calls keep the table default;
type consumers should import the props from the shared props module.

Ingredient-detail refreshes now ignore responses from a previous selection.
The hook's public return shape is unchanged.

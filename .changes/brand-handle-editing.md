packages: @genfeedai/pages, @genfeedai/props

The brand profile overview edits the brand handle inline. Its props gain an
optional `onUpdateHandle`; without it the handle stays read-only.
`useBrandDetail` returns `handleUpdateHandle`.

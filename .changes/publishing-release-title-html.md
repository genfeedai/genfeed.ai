packages: @genfeedai/pages

`@genfeedai/pages/posts/rail/release-rail-row.helpers` adds `releaseDisplayTitle`
and `releaseContentPreview`. Both return plain text from a release's stored HTML
through `stripHtmlToPlainText`, so release titles and previews on the rail, grid,
list and next-24h queue no longer show raw markup. No consumer action needed.

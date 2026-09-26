packages: @genfeedai/helpers, @genfeedai/pages, @genfeedai/props

Publishing gets a full-page post composer instead of a modal, and post/tweet
text is now handled as plain text end to end instead of leaking stored HTML
into titles, captions, and card summaries.

`stripHtmlToPlainText` lives in `@genfeedai/helpers/security/sanitize-html.helper`
— the one place that untangles stored markup for display and persistence.
`@genfeedai/pages/posts/compose/publishing-post-composer` is the new
`/publishing/posts/new` full-page composer. `PostDetailCardBody`,
`publishing-content-identity`, and `publishing-content-library.helpers` in
`@genfeedai/pages/posts` changed their prop/export surfaces to support the
title-link/overlay split and the plain-text tweet field. `ReleaseDetailDrawer`
(`@genfeedai/pages/posts/release/release-detail-drawer`) gained an
`onResumeRelease` handler and moved analytics into a tab; its prop type in
`@props/publisher/release-calendar.props` gained the matching optional field.

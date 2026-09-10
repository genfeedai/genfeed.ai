packages: props services

Add the composer surface for scheduled comments. `props` gains
`posts/post-character-usage.props` for the per-channel caption usage list, and
`modals/modal.props` widens `ModalCreateThreadPostsListProps` with the
follow-up controls: whether the selected channel accepts media on a comment,
picking and clearing a comment's media, and changing its delay.

`services` widens `PostsService.createThread` so a thread item can carry
`threadDelayMinutes` — minutes after the post goes live before that comment
publishes.

Both changes are additive. A consumer rendering `ModalCreateThreadPostsList`
must pass the new handlers; a consumer calling `createThread` needs no change,
since an item without a delay publishes with its post as before.

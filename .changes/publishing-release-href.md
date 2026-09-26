packages: @genfeedai/helpers, @genfeedai/contracts

`getPublishingReleaseHref(releaseGroupId)` links a release group to the Posts
library with its detail drawer open (`/publishing/posts?release=<id>`).
`createPublishingPostsFilterRoute` accepts a `release` option that sets the
`release` query param.

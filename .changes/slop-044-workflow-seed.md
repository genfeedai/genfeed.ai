packages: contracts, pages

Add `CommentTriggerNodeData` to the workflow seed node contract so imported
comment-trigger seeds are described directly, without casting payloads to nodes.
The editor's palette node enum is unchanged; consumers reading stored workflow
nodes can narrow the `commentTrigger` discriminator to access conversation,
credential, platform and source-content metadata.

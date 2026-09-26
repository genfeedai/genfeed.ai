packages: @genfeedai/pages

`useKnowledgeLibrary` re-reads in the background while any current source
version is queued or processing, and exports the interval as
`KNOWLEDGE_LIBRARY_POLL_INTERVAL_MS`. `refresh()` still takes no arguments.

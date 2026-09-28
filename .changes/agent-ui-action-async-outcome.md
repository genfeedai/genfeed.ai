packages: @genfeedai/contracts @genfeedai/agent

`AgentUiActionHandler` can now resolve to `'pending'` (new `AgentUiActionOutcome =
boolean | 'pending'`, exported from both packages). `'pending'` means the server
accepted the action but its result has not arrived yet; a card must stay in its
in-flight state instead of treating it as success or failure.

`@genfeedai/agent` also exports `AgentUiActionAckResponse`, and
`respondToUiAction` now returns that async ack (`{ executionId, status: 'queued',
threadId }`) instead of a synchronous `AgentChatResponse`, matching what
`POST /agent/threads/:threadId/ui-actions` actually returns. Callers reconcile
the result by the reply whose `metadata.runId` equals `executionId`.

A pending run keeps reconciling after the handler returns: `@genfeedai/agent`
exports `AgentUiActionRun`, and the chat store gains `uiActionRuns` /
`setUiActionRun`, keyed by `getUiActionRunKey(threadId, action, payload)`. The
container settles each run there when its execution completes or fails (or
resumes it when its thread is shown again). Cards that await the handler use
`useAgentUiActionRequest` to derive done / failed / in-flight from both the
immediate outcome and that run.

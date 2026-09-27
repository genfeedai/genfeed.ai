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

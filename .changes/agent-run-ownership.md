packages: @genfeedai/agent

Track stream ownership by execution ID and generation so late events, acknowledgements,
and rejected sends cannot overwrite the current run or its thread summary.

The stream hook adds `beginRunHandoff`, `adoptRun`, and `cancelRunHandoff`; callers
continuing an input request must retain the returned `AgentRunHandoff` token and
pass it to adoption or cancellation. Stream runtime adapters now carry the active
run ID, acknowledgement state, and owner generation; use the runtime factory rather
than constructing partial runtime objects. Buffered events and assistant message
metadata may include a run ID. Completion, restore, and subscription helpers use
that identity when replaying events or recovering assistant messages.

The chat store adds `markStreamLive` for server-adopted runs. Thread input responses
include the accepted execution identity for handoff. Existing message metadata
without a run ID remains supported.

Async execution and snapshot restores now retain a local ownership guard and discard responses after newer local run or thread updates. Pending new-thread acknowledgements retain ownership until their execution ID arrives.

Input handoffs retain their captured assistant-message baseline even after navigation.
`cancelRunHandoff` accepts an optional failed input request, restoring it before
buffered continuation events replay so an already-resolved prompt cannot reappear.
Hidden continuations keep their subscriptions and completion tracking; once they
settle, an already-restored visible run can acquire the released stream ownership.

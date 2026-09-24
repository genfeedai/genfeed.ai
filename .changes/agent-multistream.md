packages: @genfeedai/agent

Agent chat streaming now keeps independent thread/run entries behind one shared
socket dispatcher. `useAgentChatStream` and `useAgentChatStore` retain their
existing consumer APIs; switching threads no longer ends a background stream.

Consumers that directly inspect stream runtime internals must select the owning
entry with `findAgentStreamEntry(threadId)` instead of treating the shared runtime
as the active run. Handoff ownership and completion/subscription guards now belong
to that entry. The new `agent-chat-stream.entry` module provides the per-entry
controller, while `captureAgentStreamHydration` guards asynchronous restoration
against newer entry generations and events.

`createAgentChatStore({ ephemeral: true })` creates isolated conversation state for
these entries without loading persisted panel or terminal state. Dispose private
token buffers with `disposeStreamTokens` when releasing that state; normal UI
consumers should continue using `useAgentChatStore`.

The stream model adds an optional accepted receipt and the six-field
`agent:turn_accepted` payload. Progress summaries may display "Request accepted"
when no work, input, or terminal progress has superseded the receipt. This signal
is presentation-only and must not bind a run or start execution/watchdog state.

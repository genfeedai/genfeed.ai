packages: @genfeedai/agent

Add `pinConversationScrollToBottom` and `conversationMessagesBelongToThread`
under `./utils/conversation-scroll.util`. The conversation host reuses one
scroller across threads; these helpers pin `scrollTop` to `scrollHeight` once
the transcript belongs to the active thread so the latest turn sits above the
docked composer.

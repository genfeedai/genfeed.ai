packages: @genfeedai/models, @genfeedai/props, @genfeedai/services

Social inbox read receipts acknowledge a monotonic inbound-message cursor instead of a client-supplied unread count.

- `models`: `./social/social-conversation.model` exposes `inboundSequence`.
- `props`: `./messages/messages-conversations.props` adds `MessagesAcknowledgeableCursor`.
- `services`: `./social/messages.service` sends `seenInboundSequence` in place of `unreadCountSeen`.

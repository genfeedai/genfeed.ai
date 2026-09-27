packages: @genfeedai/contracts, @genfeedai/libs, @genfeedai/workflows

Every notification producer records through the activity recording API
(#5197); the legacy Redis `notifications` publish path is removed. Contracts
add `ActivityKey` members for workflow review requests, report delivery,
trend summaries, MCP approval requests, post lifecycle transitions and Brand
OS export audit events, with their alert policies and topics. The unused
notification payload types (`INotificationEvent`, `NotificationType`,
`INotificationPayload`, `INotificationData`, and the CRM, video-status,
chatbot, post, trend-summary and review-Slack payloads) are removed. Libs drop
`WebSocketService.publishNotification`, the gateway `notifications` channel and
`NotificationData`. Workflow send-email and report executors pass the
organization (and a report idempotency key) to their sender.

packages: config, libs, serializers

Adds the optional SYSTEM_EVENTS_ENABLED_AT and
SYSTEM_NOTIFICATIONS_DISCORD_WEBHOOK_URL configuration, the shared versioned
system-event payload contract, and the deployment notification overview
serializer. Notification recording remains disabled without an enablement time.
Configure the Discord incoming webhook only on the notifications service and
apply the additive event-outbox/settings migration before enablement. Existing
notification clients and serializers retain their contracts.

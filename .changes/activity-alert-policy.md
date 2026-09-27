packages: @genfeedai/contracts, @genfeedai/libs, @genfeedai/prisma, @genfeedai/serializers

Activity alert policy (#5197). A notification is an activity that needs
attention: `ACTIVITY_ALERT_POLICIES` / `getActivityAlertPolicy` map an
`ActivityKey` to its alert topic, recipients, default channels and severity.
New `ActivityKey` members cover workflow and agent run outcomes, agent reviews,
social replies and low credits; `ActivitySource` gains workflow and agent
sources. Channel deliveries use `IChannelMessage` / `IChannelDeliveryRequest` /
`IChannelDeliveryResponse`. Inbox items carry their source `activity` and
`severity`. The websocket gateway emits `notification-inbox` refreshes
(`NotificationInboxUpdateData`). Notification events and inbox items reference
their activity; deliveries gain `destination` and `message`, and platform
events may have no organization.

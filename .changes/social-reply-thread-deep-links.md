packages: @genfeedai/contracts/constants @genfeedai/contracts/interfaces @genfeedai/props @genfeedai/serializers @genfeedai/services @genfeedai/ui

Make the notification bell and Messages one read state.

- `@genfeedai/contracts/constants`: add `MESSAGES_CONVERSATION_QUERY_PARAM`
  (`socialConversation`) and `createMessagesConversationRoute(conversationId)`
  for brand-relative links that open one Messages thread.
- `@genfeedai/contracts/interfaces`: add `SocialInboxUnreadCountQuery` and
  `SocialInboxUnreadCount` for `GET /messages/unread-count`.
- `@genfeedai/serializers`: add `SocialInboxUnreadCountSerializer`
  (`social-inbox-unread-count`).
- `@genfeedai/services`: `SocialMessagesService` gains `unreadCount()` and
  `markRead()` (`PATCH /messages/:conversationId/read`).
- `@genfeedai/props`: `AppSwitcherProps.badges` and `AppSwitcherBadge` add count
  pills to app tiles; `UseMessagesConversationsParams.onUnreadStateChange` fires
  after a thread is read, and `UseMessagesActionsParams.onInboxReadStateChange`
  fires after a reply is posted, a draft is approved, or a thread is resolved.
- `@genfeedai/ui`: `AppSwitcher` renders `badges` on tiles and hides them at zero.

All additions are optional; existing consumers need no change.

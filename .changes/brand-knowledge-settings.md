packages: @genfeedai/contracts @genfeedai/ui

Brand Knowledge is now `APP_ROUTES.SETTINGS.KNOWLEDGE` (`/settings/knowledge`).
`APP_ROUTES.LIBRARY.KNOWLEDGE` remains as a redirect alias for saved links.

`ConversationSidebarFilters` is removed. Inbox type filters live in the Inbox
filters popover; keep `ConversationSidebarFilter` for typed option lists.

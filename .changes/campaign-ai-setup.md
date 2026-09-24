packages: @genfeedai/hooks @genfeedai/pages @genfeedai/props @genfeedai/services

Add campaign creation and content-generation dialogs, campaign account discovery,
and their shared props. `CampaignsListPage` accepts an optional `isCreateOpen` prop
so existing `/new` links open the creation modal over the campaign list.
`CampaignsService.generatePlan` creates a draft from a name and brand; it accepts
an optional idempotency key and uses a 180-second request timeout. Content
generation now allows 300 seconds; other lifecycle methods keep their default.

Existing list and service callers remain compatible. No consumer migration is
required. AI planning and content generation remain draft-only; content generation
returns per-account failure results rather than silently using the input brief.

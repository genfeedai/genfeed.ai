packages: @genfeedai/services

`HTTPBaseService` gains a protected `requestOrganizationHeaders()` for
subclasses that must stay on raw `fetch`: it applies the interceptor's binding
check (throwing `CanceledError` when a bound organization is no longer
confirmed) and returns `getRequestOrganizationHeaders()`.

`WorkflowsService.setSchedule` now writes through `PATCH /workflows/:id`
(`isScheduleEnabled`, `schedule`, `timezone`); it previously posted to a
`/workflows/:id/schedule` route the API does not expose. New
`WorkflowsService.removeSchedule(workflowId)` disables and clears the schedule
the same way.

`PromptGeneratorService` now extends `HTTPBaseService`, so its requests go
through the shared interceptor (bearer token, organization header, error
handling) instead of a private `fetch`.

`bun run check:raw-fetch-org-header` fails any client `Authorization` header
that does not also carry the routed organization (#5393).

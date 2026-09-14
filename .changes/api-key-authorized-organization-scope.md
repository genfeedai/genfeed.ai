packages: @genfeedai/props @genfeedai/services

API-key settings now bind operations to the confirmed routed organization
(#4739).

- `@genfeedai/props`: add `AuthorizedApiKeysContentProps` in
  `./settings/api-keys-content.props` for the authorized organization ID and
  explicit keyless self-hosted mode.
- `@genfeedai/services`: add `ApiKeysService.forOrganization(token,
  organizationId)` in `./management/api-keys.service`. It creates a fresh
  instance bound to the current organization revision. Settings callers use
  this factory after route/session confirmation; obsolete requests fail as
  silent cancellations before dispatch, including an A-to-B-to-A switch.
- `HTTPBaseService` adds protected `bindRequestOrganization(organizationId)`
  in `./core/interceptor.service` for this immutable binding. Existing
  unbound service factories retain their behavior; keyless self-hosted
  callers keep using the unbound API-key factory.

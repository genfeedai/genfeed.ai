# Better Auth Organization Bridge

Genfeed uses Better Auth organizations as an identity/session compatibility
layer, not as the authorization source of truth.

## Ownership

- `Organization`, `Member`, `Role`, and `Invitation` remain Genfeed domain rows.
- Tenant access continues to validate live Genfeed `Organization` and `Member`
  records, including soft-delete and active-membership checks.
- `Member.roleId -> Role` remains the authorization boundary.
- `Member.roleKey` is denormalized Better Auth compatibility state for string
  role checks.
- `Session.activeOrganizationId` is Better Auth session state. Genfeed still
  resolves request authority through `User.lastUsedOrganizationId` and validated
  membership/ownership.

## Invitations

Genfeed `InvitationService` owns organization invitations, tokens, emails,
expiry, accept/revoke behavior, and accepted-member creation. Better Auth
invitation creation is disabled by the organization bridge hook so the system
does not run two incompatible invitation sources.

The `Invitation.roleKey` and `Invitation.status` fields exist only to keep rows
readable by Better Auth organization compatibility paths. Genfeed API responses
derive user-facing invitation status from `acceptedAt`, `revokedAt`, and
`expiresAt`.

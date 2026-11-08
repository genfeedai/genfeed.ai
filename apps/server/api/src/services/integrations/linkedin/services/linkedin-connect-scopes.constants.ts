/**
 * Scopes requested when a LinkedIn account is connected.
 *
 * `w_member_social` posts as the member. `w_organization_social` posts as a
 * company page and `r_organization_admin` lists the pages the member
 * administers; both belong to LinkedIn's Community Management product, which
 * the developer app must hold or LinkedIn rejects the whole authorization.
 */
export const LINKEDIN_CONNECT_SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',
  'r_organization_admin',
  'w_organization_social',
] as const;

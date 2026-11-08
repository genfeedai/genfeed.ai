/**
 * Who a LinkedIn credential posts as.
 *
 * A connected LinkedIn account is either the member's personal profile or a
 * company page (organization) the member administers. The credential's
 * `externalId` is the only record of which one: a company page stores its full
 * `urn:li:organization:{id}`, a personal profile stores the bare member id that
 * the OpenID `sub` claim returns. Every publish, comment and verification call
 * derives its author from that value, never from the token's own profile, so a
 * page connection can never fall back to the person who authorized it.
 */

const LINKEDIN_PERSON_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const LINKEDIN_PERSON_URN_PATTERN = /^urn:li:person:[A-Za-z0-9_-]+$/;
const LINKEDIN_ORGANIZATION_URN_PATTERN = /^urn:li:organization:\d+$/;
const LINKEDIN_ORGANIZATION_ID_PATTERN = /^\d+$/;

export function buildLinkedInOrganizationUrn(organizationId: string): string {
  if (!LINKEDIN_ORGANIZATION_ID_PATTERN.test(organizationId)) {
    throw new Error('LinkedIn organization id must be numeric');
  }
  return `urn:li:organization:${organizationId}`;
}

export function isLinkedInOrganizationUrn(value: string | null | undefined) {
  return (
    typeof value === 'string' && LINKEDIN_ORGANIZATION_URN_PATTERN.test(value)
  );
}

/**
 * The author URN a credential posts as.
 *
 * @throws when the credential holds no identity, or one that is neither a
 *   member id nor an organization URN.
 */
export function resolveLinkedInAuthorUrn(
  externalId: string | null | undefined,
): string {
  if (!externalId) {
    throw new Error('LinkedIn credential has no connected account');
  }

  if (isLinkedInOrganizationUrn(externalId)) {
    return externalId;
  }

  if (LINKEDIN_PERSON_URN_PATTERN.test(externalId)) {
    return externalId;
  }

  if (LINKEDIN_PERSON_ID_PATTERN.test(externalId)) {
    return `urn:li:person:${externalId}`;
  }

  throw new Error('LinkedIn credential identity is not a member or page');
}

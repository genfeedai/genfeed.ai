export const SKILL_OWNER_KINDS = [
  'system',
  'user',
  'organization',
  'brand',
] as const;
export type SkillOwnerKind = (typeof SKILL_OWNER_KINDS)[number];

export const SKILL_AUDIENCES = ['private', 'organization', 'public'] as const;
export type SkillAudience = (typeof SKILL_AUDIENCES)[number];

export const SKILL_GRANT_ACCESS = ['use', 'use_and_read'] as const;
export type SkillGrantAccess = (typeof SKILL_GRANT_ACCESS)[number];

export interface SkillCapabilityActor {
  userId: string;
  organizationId: string;
  brandId?: string;
  isOrganizationAdmin: boolean;
  isBrandAdmin: boolean;
}

export interface SkillCapabilitySubject {
  ownerKind: SkillOwnerKind | null;
  ownerUserId: string | null;
  organizationId: string | null;
  brandId: string | null;
  audience: SkillAudience;
  isQuarantined: boolean;
  hasPublishedVersion: boolean;
}

export interface SkillCapabilityGrant {
  access: SkillGrantAccess;
  recipientKind: 'user' | 'organization' | 'brand';
  recipientUserId: string | null;
  recipientOrganizationId: string | null;
  recipientBrandId: string | null;
  isRevoked: boolean;
}

/** Verified source policy. Imported license text is never this object. */
export interface SkillSourcePolicy {
  allowsRead: boolean;
  allowsDerivatives: boolean;
  allowsExport: boolean;
  allowsShare: boolean;
  allowsPublicPublication: boolean;
}

export interface SkillCapabilities {
  canUse: boolean;
  canRead: boolean;
  canEdit: boolean;
  canShare: boolean;
  canPublish: boolean;
  canFork: boolean;
  canExport: boolean;
}

export const CLOSED_SKILL_SOURCE_POLICY: SkillSourcePolicy = {
  allowsRead: false,
  allowsDerivatives: false,
  allowsExport: false,
  allowsShare: false,
  allowsPublicPublication: false,
};

export const PUBLIC_FREE_SOURCE_POLICY: SkillSourcePolicy = {
  allowsRead: true,
  allowsDerivatives: false,
  allowsExport: false,
  allowsShare: true,
  allowsPublicPublication: true,
};

function isBlank(value: string | null | undefined): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function grantMatchesActor(
  grant: SkillCapabilityGrant,
  actor: SkillCapabilityActor,
): boolean {
  if (grant.isRevoked) {
    return false;
  }

  if (grant.recipientKind === 'user') {
    return grant.recipientUserId === actor.userId;
  }

  if (grant.recipientKind === 'organization') {
    return grant.recipientOrganizationId === actor.organizationId;
  }

  return (
    grant.recipientBrandId === actor.brandId &&
    grant.recipientOrganizationId === actor.organizationId &&
    !isBlank(actor.brandId)
  );
}

function governs(
  subject: SkillCapabilitySubject,
  actor: SkillCapabilityActor,
): boolean {
  if (subject.isQuarantined || subject.ownerKind === null) {
    return false;
  }

  if (subject.ownerKind === 'user') {
    return subject.ownerUserId === actor.userId;
  }

  if (subject.ownerKind === 'system') {
    return false;
  }

  if (subject.organizationId !== actor.organizationId) {
    return false;
  }

  if (subject.ownerKind === 'organization') {
    return actor.isOrganizationAdmin;
  }

  if (subject.ownerKind === 'brand') {
    return (
      actor.isOrganizationAdmin ||
      (actor.isBrandAdmin && subject.brandId === actor.brandId)
    );
  }

  return false;
}

/**
 * Server-computed capabilities. Use never implies read. Governance never
 * follows a grant, and a paid or closed source policy cannot be widened here.
 */
export function resolveSkillCapabilities(
  subject: SkillCapabilitySubject,
  actor: SkillCapabilityActor,
  grants: readonly SkillCapabilityGrant[],
  sourcePolicy: SkillSourcePolicy,
): SkillCapabilities {
  const none: SkillCapabilities = {
    canUse: false,
    canRead: false,
    canEdit: false,
    canShare: false,
    canPublish: false,
    canFork: false,
    canExport: false,
  };

  if (subject.isQuarantined || subject.ownerKind === null) {
    return none;
  }

  const isGovernor = governs(subject, actor);
  const liveGrants = grants.filter((grant) => grantMatchesActor(grant, actor));
  const hasUse = liveGrants.some(
    (grant) => grant.access === 'use' || grant.access === 'use_and_read',
  );
  const hasReadGrant = liveGrants.some(
    (grant) => grant.access === 'use_and_read',
  );
  const organizationCanSee =
    subject.audience === 'organization' &&
    subject.organizationId === actor.organizationId &&
    (subject.ownerKind === 'organization' || subject.ownerKind === 'brand');
  const publicCanRead =
    subject.audience === 'public' &&
    subject.hasPublishedVersion &&
    sourcePolicy.allowsRead;

  const canRead =
    sourcePolicy.allowsRead &&
    (isGovernor || hasReadGrant || organizationCanSee || publicCanRead);
  const canUse =
    isGovernor ||
    hasUse ||
    hasReadGrant ||
    organizationCanSee ||
    (subject.audience === 'public' && subject.hasPublishedVersion);

  return {
    canUse,
    canRead,
    canEdit: isGovernor,
    canShare: isGovernor && sourcePolicy.allowsShare,
    canPublish: isGovernor && sourcePolicy.allowsPublicPublication,
    canFork: canRead && sourcePolicy.allowsDerivatives,
    canExport: canRead && sourcePolicy.allowsExport,
  };
}

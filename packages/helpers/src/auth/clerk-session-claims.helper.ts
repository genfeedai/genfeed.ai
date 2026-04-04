type UnknownRecord = Record<string, unknown>;

export type ClerkSessionPublicMetadata = {
  brand?: string;
  category?: string;
  clerkId?: string;
  isOnboardingCompleted?: boolean;
  isSuperAdmin?: boolean;
  organization?: string;
  role?: string;
  stripeSubscriptionStatus?: string;
  subscriptionTier?: string;
  user?: string;
};

export type ClerkSessionClaims = {
  brandId?: string;
  category?: string;
  clerkUserId?: string;
  email?: string;
  firstName?: string;
  isOnboardingCompleted?: boolean;
  isSuperAdmin?: boolean;
  lastName?: string;
  mongoUserId?: string;
  organizationId?: string;
  role?: string;
  stripeSubscriptionStatus?: string;
  subscriptionTier?: string;
};

export type ClerkHotPathUser = {
  email?: string;
  emailAddresses?: Array<{
    emailAddress?: string;
  }>;
  firstName?: string;
  id: string;
  lastName?: string;
  publicMetadata: ClerkSessionPublicMetadata;
};

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
}

function getNestedRecord(
  record: UnknownRecord | undefined,
  ...keys: string[]
): UnknownRecord | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const nested = asRecord(record[key]);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function uniqueRecords(
  records: Array<UnknownRecord | undefined>,
): UnknownRecord[] {
  const seen = new Set<UnknownRecord>();
  const result: UnknownRecord[] = [];

  for (const record of records) {
    if (!record || seen.has(record)) {
      continue;
    }

    seen.add(record);
    result.push(record);
  }

  return result;
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getBooleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getFirstStringFromRecords(
  records: UnknownRecord[],
  keys: readonly string[],
): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = getStringValue(record[key]);
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

function getFirstBooleanFromRecords(
  records: UnknownRecord[],
  keys: readonly string[],
): boolean | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = getBooleanValue(record[key]);
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

function getEmailClaims(
  topLevel: UnknownRecord,
  records: UnknownRecord[],
): {
  email?: string;
  firstName?: string;
  lastName?: string;
} {
  return {
    email:
      getStringValue(topLevel.email) ??
      getStringValue(topLevel.email_address) ??
      getFirstStringFromRecords(records, [
        'email',
        'emailAddress',
        'email_address',
      ]),
    firstName:
      getStringValue(topLevel.given_name) ??
      getStringValue(topLevel.firstName) ??
      getStringValue(topLevel.first_name) ??
      getFirstStringFromRecords(records, [
        'given_name',
        'firstName',
        'first_name',
      ]),
    lastName:
      getStringValue(topLevel.family_name) ??
      getStringValue(topLevel.lastName) ??
      getStringValue(topLevel.last_name) ??
      getFirstStringFromRecords(records, [
        'family_name',
        'lastName',
        'last_name',
      ]),
  };
}

function getMetadataRecords(source: UnknownRecord): UnknownRecord[] {
  const claims = getNestedRecord(source, 'claims');
  const metadata = getNestedRecord(source, 'metadata');
  const publicMetadata = getNestedRecord(
    source,
    'publicMetadata',
    'public_metadata',
  );

  return uniqueRecords([
    getNestedRecord(metadata, 'publicMetadata', 'public_metadata'),
    publicMetadata,
    metadata,
    getNestedRecord(claims, 'publicMetadata', 'public_metadata'),
    getNestedRecord(claims, 'metadata'),
    claims,
    source,
  ]);
}

export function resolveClerkSessionClaims(source: unknown): ClerkSessionClaims {
  const topLevel = asRecord(source);
  if (!topLevel) {
    return {};
  }

  const claims = getNestedRecord(topLevel, 'claims');
  const metadataRecords = getMetadataRecords(topLevel);
  const topLevelOnly = [topLevel];
  const emailClaims = getEmailClaims(topLevel, metadataRecords);

  return {
    brandId: getFirstStringFromRecords(metadataRecords, [
      'brandId',
      'brand_id',
      'brand',
    ]),
    category: getFirstStringFromRecords(metadataRecords, ['category']),
    clerkUserId:
      getStringValue(topLevel.sub) ??
      getStringValue(claims?.sub) ??
      getStringValue(topLevel.userId) ??
      getStringValue(topLevel.user_id) ??
      getStringValue(claims?.userId) ??
      getStringValue(claims?.user_id),
    email: emailClaims.email,
    firstName: emailClaims.firstName,
    isOnboardingCompleted: getFirstBooleanFromRecords(metadataRecords, [
      'isOnboardingCompleted',
      'is_onboarding_completed',
    ]),
    isSuperAdmin: getFirstBooleanFromRecords(metadataRecords, [
      'isSuperAdmin',
      'is_super_admin',
    ]),
    lastName: emailClaims.lastName,
    mongoUserId:
      getFirstStringFromRecords(topLevelOnly, [
        'mongoUserId',
        'mongo_user_id',
      ]) ??
      getFirstStringFromRecords(metadataRecords, [
        'mongoUserId',
        'mongo_user_id',
        'user',
        'userId',
        'user_id',
      ]),
    organizationId: getFirstStringFromRecords(metadataRecords, [
      'organizationId',
      'organization_id',
      'organization',
      'orgId',
      'org_id',
    ]),
    role: getFirstStringFromRecords(metadataRecords, ['role']),
    stripeSubscriptionStatus: getFirstStringFromRecords(metadataRecords, [
      'stripeSubscriptionStatus',
      'stripe_subscription_status',
    ]),
    subscriptionTier: getFirstStringFromRecords(metadataRecords, [
      'subscriptionTier',
      'subscription_tier',
    ]),
  };
}

export function hasClerkHotPathClaims(
  claims: ClerkSessionClaims,
  options: { requireBrand?: boolean } = {},
): boolean {
  const hasBaseClaims = Boolean(
    claims.clerkUserId && claims.mongoUserId && claims.organizationId,
  );

  if (!hasBaseClaims) {
    return false;
  }

  if (options.requireBrand) {
    return Boolean(claims.brandId);
  }

  return true;
}

export function buildClerkPublicMetadataFromClaims(
  claims: ClerkSessionClaims,
): ClerkSessionPublicMetadata {
  return {
    ...(claims.brandId ? { brand: claims.brandId } : {}),
    ...(claims.category ? { category: claims.category } : {}),
    ...(claims.clerkUserId ? { clerkId: claims.clerkUserId } : {}),
    ...(claims.isOnboardingCompleted !== undefined
      ? { isOnboardingCompleted: claims.isOnboardingCompleted }
      : {}),
    ...(claims.isSuperAdmin !== undefined
      ? { isSuperAdmin: claims.isSuperAdmin }
      : {}),
    ...(claims.organizationId ? { organization: claims.organizationId } : {}),
    ...(claims.role ? { role: claims.role } : {}),
    ...(claims.stripeSubscriptionStatus
      ? { stripeSubscriptionStatus: claims.stripeSubscriptionStatus }
      : {}),
    ...(claims.subscriptionTier
      ? { subscriptionTier: claims.subscriptionTier }
      : {}),
    ...(claims.mongoUserId ? { user: claims.mongoUserId } : {}),
  };
}

export function buildClerkHotPathUser(
  claims: ClerkSessionClaims,
): ClerkHotPathUser | null {
  if (!claims.clerkUserId) {
    return null;
  }

  const emailAddresses = claims.email
    ? [{ emailAddress: claims.email }]
    : undefined;

  return {
    ...(claims.email ? { email: claims.email } : {}),
    ...(emailAddresses ? { emailAddresses } : {}),
    ...(claims.firstName ? { firstName: claims.firstName } : {}),
    id: claims.clerkUserId,
    ...(claims.lastName ? { lastName: claims.lastName } : {}),
    publicMetadata: buildClerkPublicMetadataFromClaims(claims),
  };
}

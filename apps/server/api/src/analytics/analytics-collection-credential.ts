import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import type { CredentialPlatform } from '@genfeedai/contracts';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';

export type AnalyticsCollectionCredentialResolution =
  | { credentialId: string; kind: 'exact' }
  | { credentialId: string; kind: 'legacy_resolved' }
  | { kind: 'ambiguous' }
  | { kind: 'missing' }
  | { kind: 'mismatch' };

export const ANALYTICS_ACCOUNT_AMBIGUOUS_FAILURE = {
  code: 'analytics.account_ambiguous',
  isRetryable: false,
  message:
    'Analytics could not choose an account because more than one connected credential matches this post.',
} as const;

export const ANALYTICS_ACCOUNT_MISSING_FAILURE = {
  code: 'analytics.account_missing',
  isRetryable: false,
  message: 'Analytics could not find a connected account for this post.',
} as const;

export const ANALYTICS_ACCOUNT_MISMATCH_FAILURE = {
  code: 'analytics.account_mismatch',
  isRetryable: false,
  message:
    'The post credential does not belong to this organization, brand, and platform.',
} as const;

export function isAnalyticsAttributionFailure(code: string): boolean {
  return (
    code === ANALYTICS_ACCOUNT_AMBIGUOUS_FAILURE.code ||
    code === ANALYTICS_ACCOUNT_MISSING_FAILURE.code ||
    code === ANALYTICS_ACCOUNT_MISMATCH_FAILURE.code
  );
}

export interface AnalyticsCollectionCredentialLookup {
  findConnectedAccounts(
    organizationId: string,
    brandId: string,
    platform: CredentialPlatform,
  ): Promise<Pick<CredentialDocument, 'id'>[]>;
  findOne(query: {
    id: string;
    isDeleted: false;
    organizationId: string;
  }): Promise<Pick<
    CredentialDocument,
    'brandId' | 'id' | 'organizationId' | 'platform'
  > | null>;
}

export async function resolveAnalyticsCollectionCredential(options: {
  brandId: string;
  credentialId?: string;
  lookup: AnalyticsCollectionCredentialLookup;
  organizationId: string;
  platform: CredentialPlatform;
}): Promise<AnalyticsCollectionCredentialResolution> {
  if (options.credentialId) {
    const named = await options.lookup.findOne({
      id: options.credentialId,
      isDeleted: false,
      organizationId: options.organizationId,
    });

    if (
      !named ||
      named.brandId !== options.brandId ||
      named.organizationId !== options.organizationId ||
      fromPrismaCredentialPlatform(named.platform) !== options.platform
    ) {
      return { kind: 'mismatch' };
    }

    return { credentialId: named.id, kind: 'exact' };
  }

  const accounts = await options.lookup.findConnectedAccounts(
    options.organizationId,
    options.brandId,
    options.platform,
  );

  if (accounts.length === 0) {
    return { kind: 'missing' };
  }

  if (accounts.length > 1) {
    return { kind: 'ambiguous' };
  }

  const [account] = accounts;
  if (!account) {
    return { kind: 'missing' };
  }

  return { credentialId: account.id, kind: 'legacy_resolved' };
}

export function attributionFailureFor(
  kind: 'ambiguous' | 'missing' | 'mismatch',
) {
  if (kind === 'ambiguous') {
    return ANALYTICS_ACCOUNT_AMBIGUOUS_FAILURE;
  }
  if (kind === 'missing') {
    return ANALYTICS_ACCOUNT_MISSING_FAILURE;
  }
  return ANALYTICS_ACCOUNT_MISMATCH_FAILURE;
}

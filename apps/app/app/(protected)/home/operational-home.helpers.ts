import {
  getBrandOrganizationId,
  getBrandOrganizationSlug,
} from '@contexts/user/brand-context/brand-context.helpers';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/constants';
import type { IBrand, ICredential } from '@genfeedai/interfaces';
import type { ApiKey } from '@genfeedai/models/auth/api-key.model';

interface ConnectGenfeedMetadata {
  lastVerifiedAt: string;
  transport: 'streamable-http';
}

export interface CredentialHealthSummary {
  attention: number;
  healthy: number;
  total: number;
  unknown: number;
}

export interface OperationalHomeScope {
  brand: IBrand | undefined;
  brandSlug: string | undefined;
  organizationId: string;
  orgSlug: string;
}

export function resolveOperationalHomeScope({
  accessOrganizationId,
  brands,
  organizationId,
  selectedBrand,
}: {
  accessOrganizationId?: string;
  brands: IBrand[];
  organizationId?: string;
  selectedBrand?: IBrand | null;
}): OperationalHomeScope {
  const scopedOrganizationId = organizationId || accessOrganizationId || '';
  const brand =
    [selectedBrand, ...brands].find(
      (candidate) =>
        candidate && getBrandOrganizationId(candidate) === scopedOrganizationId,
    ) ?? undefined;

  return {
    brand,
    brandSlug: brand?.slug || undefined,
    organizationId: scopedOrganizationId,
    orgSlug: getBrandOrganizationSlug(brand),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getConnectGenfeedMetadata(
  metadata: Record<string, unknown> | undefined,
  now: number,
): ConnectGenfeedMetadata | null {
  const connectGenfeed = metadata?.connectGenfeed;

  if (
    !isRecord(connectGenfeed) ||
    connectGenfeed.transport !== 'streamable-http' ||
    typeof connectGenfeed.lastVerifiedAt !== 'string'
  ) {
    return null;
  }

  const verifiedAt = Date.parse(connectGenfeed.lastVerifiedAt);

  if (!Number.isFinite(verifiedAt) || verifiedAt > now) {
    return null;
  }

  return {
    lastVerifiedAt: connectGenfeed.lastVerifiedAt,
    transport: 'streamable-http',
  };
}

export function getVerifiedMcpConnection(
  apiKeys: ApiKey[],
  organizationId: string,
  now = Date.now(),
): { apiKey: ApiKey; verifiedAt: string } | null {
  for (const apiKey of apiKeys) {
    const apiKeyOrganizationId =
      typeof apiKey.organization === 'string'
        ? apiKey.organization
        : apiKey.organization?.id;
    const expiresAt = apiKey.expiresAt ? Date.parse(apiKey.expiresAt) : null;
    const isExpired =
      expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= now);
    const hasRequiredScopes = API_KEY_SCOPE_PRESETS.mcp.every((scope) =>
      apiKey.scopes.includes(scope),
    );
    const verification = getConnectGenfeedMetadata(apiKey.metadata, now);

    if (
      apiKey.isActive &&
      !apiKey.isRevoked &&
      apiKeyOrganizationId === organizationId &&
      !isExpired &&
      hasRequiredScopes &&
      verification
    ) {
      return { apiKey, verifiedAt: verification.lastVerifiedAt };
    }
  }

  return null;
}

export function summarizeCredentialHealth(
  credentials: ICredential[],
): CredentialHealthSummary {
  return credentials.reduce<CredentialHealthSummary>(
    (summary, credential) => {
      summary.total += 1;

      if (!credential.isConnected) {
        summary.attention += 1;
        return summary;
      }

      if (
        credential.accountHealth?.holdPublishing ||
        credential.accountHealth?.riskLevel === 'high'
      ) {
        summary.attention += 1;
      } else if (
        credential.accountHealth?.state === 'healthy' ||
        credential.accountHealth?.riskLevel === 'low'
      ) {
        summary.healthy += 1;
      } else {
        summary.unknown += 1;
      }

      return summary;
    },
    {
      attention: 0,
      healthy: 0,
      total: 0,
      unknown: 0,
    },
  );
}

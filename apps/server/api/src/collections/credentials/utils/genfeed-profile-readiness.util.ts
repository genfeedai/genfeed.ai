import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { AssetScope, CredentialPlatform } from '@genfeedai/contracts';
import type {
  IPublishingDiagnostic,
  IPublishingProviderReadiness,
} from '@genfeedai/contracts/interfaces';
import { buildPublishingProviderReadiness } from '@genfeedai/helpers';

export interface GenfeedProfileReadinessInput {
  /** The brand behind the channel, or null when it is gone. */
  brand: { isDeleted: boolean; scope: string } | null | undefined;
  checkedAt: string;
  credentialId: string;
  isConnected: boolean;
}

const PUBLIC_BRAND_SCOPE = CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC);

/** True when the brand's profile renders on genfeed.ai. */
export function isGenfeedProfilePublic(
  brand: GenfeedProfileReadinessInput['brand'],
): boolean {
  return Boolean(
    brand && !brand.isDeleted && String(brand.scope) === PUBLIC_BRAND_SCOPE,
  );
}

/**
 * Readiness of the built-in Genfeed profile channel. It holds no tokens, so
 * the token checks every other channel goes through do not apply: it can
 * publish while it is switched on and the brand's profile is public.
 */
export function buildGenfeedProfileReadiness(
  input: GenfeedProfileReadinessInput,
): IPublishingProviderReadiness {
  const diagnostics: IPublishingDiagnostic[] = [];

  if (!input.isConnected) {
    diagnostics.push({
      checkedAt: input.checkedAt,
      classification: 'misconfiguration',
      code: 'genfeed_profile_channel_off',
      correctiveAction: 'Turn the Genfeed profile channel back on.',
      isRetryable: false,
      message: 'The Genfeed profile channel is switched off.',
      scope: 'credential',
      severity: 'error',
    });
  } else if (!isGenfeedProfilePublic(input.brand)) {
    diagnostics.push({
      checkedAt: input.checkedAt,
      classification: 'misconfiguration',
      code: 'genfeed_profile_private',
      correctiveAction:
        'Make the brand profile public in brand settings to publish on genfeed.ai.',
      isRetryable: false,
      message: 'This brand profile is private, so genfeed.ai cannot show it.',
      scope: 'credential',
      severity: 'error',
    });
  }

  return buildPublishingProviderReadiness({
    appReviewStatus: 'pass',
    callbackUrlStatus: 'pass',
    credentialId: input.credentialId,
    diagnostics,
    permissionScopeStatus: 'pass',
    providerKey: CredentialPlatform.GENFEED,
    quotaStatus: 'pass',
    tokenFreshness: 'pass',
  });
}

import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { traced } from '@libs/tracing/traced';

/**
 * Credential filter for accounts a member connected on a network. Every brand
 * has the built-in profile channel from the start, so "has a connected
 * account" checks (onboarding, connection counts) leave it out.
 */
export const NETWORK_ACCOUNT_WHERE = {
  platform: { not: 'GENFEED' },
} as const;

/** Connected network accounts, optionally of one brand. */
export function networkAccountsWhere(brandId?: string) {
  return {
    ...NETWORK_ACCOUNT_WHERE,
    isConnected: true,
    ...(brandId ? { brandId } : {}),
  };
}

/** The label every member sees for the built-in channel. */
export const GENFEED_PROFILE_CHANNEL_LABEL = 'Genfeed profile';

export interface GenfeedProfileChannelBrand {
  id: string;
  organizationId: string;
  slug: string;
  userId?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Every brand publishes to its own profile at genfeed.ai/@handle. The channel
 * needs no OAuth, so it is created with the brand and then behaves like any
 * connected account: the composer, the scheduler and the release board treat
 * it as one. A brand has at most one (a partial unique index holds that), so a
 * second create is refused and left alone.
 */
export const createGenfeedProfileChannel = traced(
  'createGenfeedProfileChannel',
  async (
    prisma: Pick<PrismaService, 'credential'>,
    logger: Pick<LoggerService, 'error'>,
    brand: GenfeedProfileChannelBrand,
  ): Promise<void> => {
    try {
      await prisma.credential.create({
        data: {
          brandId: brand.id,
          externalHandle: brand.slug,
          externalId: brand.id,
          isConnected: true,
          label: GENFEED_PROFILE_CHANNEL_LABEL,
          organizationId: brand.organizationId,
          platform: 'GENFEED',
          ...(brand.userId ? { userId: brand.userId } : {}),
        },
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        return;
      }
      // The brand itself was created; a missing channel only hides one
      // destination, so it never fails the brand write.
      logger.error('Genfeed profile channel could not be created', {
        brandId: brand.id,
        error,
        organizationId: brand.organizationId,
      });
    }
  },
);

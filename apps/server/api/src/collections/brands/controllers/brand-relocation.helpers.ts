import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type {
  BrandRelocationActingUser,
  BrandRelocationSummary,
} from '@api/collections/brands/services/brand-relocation.service';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

/**
 * Who is moving the brand, as the request authenticated them. An API key
 * carries its own scopes: it relocates only with an explicit admin scope, which
 * the relocation service enforces.
 */
export function toRelocationActor(
  user: User,
  request: Request,
): BrandRelocationActingUser {
  return {
    isApiKey: user.isApiKey,
    isSuperAdmin: getIsSuperAdmin(user, request),
    scopes: user.scopes,
    userId: user.userId ?? user.id,
  };
}

/**
 * Record a committed relocation, which can never fail the request that made
 * it. The destination organization's record carries the move; the source
 * organization gets its own (without the brand, which no longer lives there),
 * so the brand owner and both organization owners hear about it.
 */
export async function recordBrandRelocation(
  activityRecorder: Pick<ActivityRecorderService, 'recordMany'>,
  logger: Pick<LoggerService, 'error'>,
  params: {
    brandId: string;
    brandOwnerId?: string | null;
    destinationOrganizationId: string;
    sourceOrganizationId?: string;
    summary: BrandRelocationSummary;
    userId: string;
  },
): Promise<void> {
  const userId = params.brandOwnerId ?? params.userId;
  const value = JSON.stringify(params.summary);
  const data = {
    destinationOrganizationId: params.destinationOrganizationId,
    sourceOrganizationId: params.sourceOrganizationId ?? null,
  };
  try {
    await activityRecorder.recordMany([
      {
        brandId: params.brandId,
        data,
        key: ActivityKey.BRAND_RELOCATED,
        organizationId: params.destinationOrganizationId,
        source: ActivitySource.BRAND_RELOCATION,
        userId,
        value,
      },
      ...(params.sourceOrganizationId
        ? [
            {
              brandId: null,
              data: { ...data, brandId: params.brandId },
              key: ActivityKey.BRAND_RELOCATED,
              organizationId: params.sourceOrganizationId,
              source: ActivitySource.BRAND_RELOCATION,
              userId,
              value,
            },
          ]
        : []),
    ]);
  } catch (error: unknown) {
    logger.error('Failed to record brand relocation activity', error, {
      brandId: params.brandId,
    });
  }
}

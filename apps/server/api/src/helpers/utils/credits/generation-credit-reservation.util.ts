import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { ActivitySource, CreditReservationStatus } from '@genfeedai/contracts';
import {
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
  MEDIA_GENERATION_HOLD_TTL_MS,
} from '@genfeedai/contracts/constants';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';

const MAX_EXTERNAL_IDEMPOTENCY_KEY_LENGTH = 160;

export type ReservationCreditsConfig = CreditsConfig & {
  deferred?: boolean;
  maxOverdraftCredits?: number;
  reservationId?: string;
};

export type GenerationCreditReservationRequest = {
  body?: unknown;
  creditsConfig?: ReservationCreditsConfig;
  user?: AuthenticatedUser;
};

type ReservationCreditsClient = Pick<CreditsUtilsService, 'reserveCredits'>;

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed
    ? trimmed.slice(0, MAX_EXTERNAL_IDEMPOTENCY_KEY_LENGTH)
    : undefined;
}

function readSourceActionId(request: GenerationCreditReservationRequest) {
  const body = request.body as Record<string, unknown> | undefined;
  const data = body?.data as Record<string, unknown> | undefined;
  const attributes =
    (data?.attributes as Record<string, unknown> | undefined) ??
    (body?.attributes as Record<string, unknown> | undefined);
  return (
    readString(body?.sourceActionId) ?? readString(attributes?.sourceActionId)
  );
}

export function hasGenerationSourceActionId(
  request: GenerationCreditReservationRequest,
): boolean {
  return readSourceActionId(request) !== undefined;
}

/**
 * Reserve a request's finalized generation price before provider work starts.
 *
 * The reservation identity rides on `creditsConfig` so the response
 * interceptor can either queue settlement or release the hold when the
 * request fails. Source-action identities survive HTTP retries because those
 * generation routes also deduplicate provider dispatch; ordinary independent
 * requests receive distinct reservation keys.
 */
export async function reserveGenerationRequestCredits(params: {
  amount: number;
  creditsUtilsService: ReservationCreditsClient;
  organizationId: string;
  request: GenerationCreditReservationRequest;
}): Promise<string | undefined> {
  const config = params.request.creditsConfig;
  const actorUserId = params.request.user?.userId;
  if (
    !config ||
    config.isByokBypass ||
    config.reservationId ||
    !actorUserId ||
    !(params.amount > 0)
  ) {
    return config?.reservationId;
  }

  const workloadId = readSourceActionId(params.request) ?? randomUUID();
  const brandId = params.request.user?.brandId || null;
  const reservationInput = {
    actorUserId,
    amount: params.amount,
    ...(brandId ? { brandId } : {}),
    description: config.description,
    expiresAt: new Date(Date.now() + MEDIA_GENERATION_HOLD_TTL_MS),
    idempotencyKey: `${GENERATION_POOL_WORKLOAD_TYPE}:${workloadId}`,
    ...(config.pricingMetadata || config.modelQuote
      ? {
          metadata: {
            ...config.pricingMetadata,
            ...(config.modelQuote ? { modelQuote: config.modelQuote } : {}),
          },
        }
      : {}),
    organizationId: params.organizationId,
    source: config.source ?? ActivitySource.SCRIPT,
    workloadId,
    workloadType:
      config.modelQuote && config.settlement === 'completion'
        ? MEDIA_GENERATION_GROUP_WORKLOAD_TYPE
        : GENERATION_POOL_WORKLOAD_TYPE,
  };
  let reservation =
    await params.creditsUtilsService.reserveCredits(reservationInput);

  // A failed source-action may be retried after its first hold was released.
  // Preserve that terminal row for audit and create a distinct hold for the
  // new provider attempt.
  if (
    reservation.status === CreditReservationStatus.RELEASED ||
    reservation.status === CreditReservationStatus.EXPIRED
  ) {
    reservation = await params.creditsUtilsService.reserveCredits({
      ...reservationInput,
      idempotencyKey: `${reservationInput.idempotencyKey}:retry:${randomUUID()}`,
    });
  }

  const originalQuote = modelBillableQuoteSnapshotSchema.safeParse(
    reservation.metadata?.modelQuote,
  );
  if (config.modelQuote && !originalQuote.success)
    throw new Error('Reserved generation quote evidence is missing');
  params.request.creditsConfig = {
    ...config,
    ...(originalQuote.success ? { modelQuote: originalQuote.data } : {}),
    amount:
      reservation.status === CreditReservationStatus.SETTLED
        ? (reservation.settledAmount ?? reservation.amount)
        : reservation.amount,
    reservationId: reservation.id,
  };
  return reservation.id;
}

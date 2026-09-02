import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreditReservationStatus } from '@genfeedai/enums';
import type { CreditsConfig } from '@genfeedai/interfaces';

// Media settlement retries for seven days. Keep the hold alive for one extra
// day so the expiry sweep cannot race the final worker retry.
const GENERATION_RESERVATION_TTL_MS = 8 * 24 * 60 * 60 * 1000;
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
  const reservationInput = {
    actorUserId,
    amount: params.amount,
    expiresAt: new Date(Date.now() + GENERATION_RESERVATION_TTL_MS),
    idempotencyKey: `generation:${workloadId}`,
    organizationId: params.organizationId,
    workloadId,
    workloadType: 'generation',
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

  params.request.creditsConfig = {
    ...config,
    amount:
      reservation.status === CreditReservationStatus.SETTLED
        ? (reservation.settledAmount ?? reservation.amount)
        : reservation.amount,
    reservationId: reservation.id,
  };
  return reservation.id;
}

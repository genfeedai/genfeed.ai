import { createHash } from 'node:crypto';
import { scopedWhere } from '@api/index';
import {
  CadenceGenerateLanding,
  CalendarSlotItemType,
  CalendarSlotState,
  PostCategory,
  PostingCadenceStatus,
} from '@genfeedai/contracts';
import {
  expandCadenceOccurrences,
  isWithinConsumptionTolerance,
  MAX_CADENCE_SPAN_DAYS,
} from '@genfeedai/contracts/api-types/contracts/cadence-expansion.contract';
import type {
  ICalendarSlot,
  IPostingCadence,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';
import type {
  CadenceRecord,
  MatchingTarget,
  ReservationDelegate,
  ReservationRecord,
} from './posting-cadence.types';

export function isConsumedReservation(
  reservation?: ReservationRecord,
): boolean {
  if (!reservation) {
    return false;
  }
  if (
    reservation.state === CalendarSlotState.SKIPPED ||
    reservation.state === CalendarSlotState.FILLED
  ) {
    return true;
  }
  return (
    reservation.generatedItemType === CalendarSlotItemType.ARTICLE &&
    Boolean(reservation.generatedItemId)
  );
}

export function assertCadenceBounds(input: {
  endsAt: Date | null;
  maxOccurrences: number | null;
  startsAt: Date;
  windowEndMinute: number;
  windowStartMinute: number;
}): void {
  if (!input.endsAt && input.maxOccurrences === null) {
    throw new BadRequestException(
      'A cadence requires an end date or a max occurrence count.',
    );
  }
  if (input.windowEndMinute < input.windowStartMinute) {
    throw new BadRequestException(
      'windowEndMinute must be on or after windowStartMinute.',
    );
  }
  if (input.endsAt) {
    const maxEnd = new Date(
      input.startsAt.getTime() + MAX_CADENCE_SPAN_DAYS * 24 * 60 * 60 * 1000,
    );
    if (input.endsAt > maxEnd) {
      throw new BadRequestException(
        `A cadence end date cannot be more than ${MAX_CADENCE_SPAN_DAYS} days after start.`,
      );
    }
  }
}

export function toArticleSlug(label: string, identityKey: string): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'article';
  const suffix = identityKey
    ? createHash('sha256').update(identityKey).digest('hex').slice(0, 12)
    : 'slot';
  return `${base}-${suffix}`;
}

export function matchingTarget(
  targets: MatchingTarget[],
  slot: ICalendarSlot,
): MatchingTarget | undefined {
  return targets.find(
    (target) =>
      target.credentialId === slot.credentialId &&
      target.category === slot.format &&
      target.scheduledDate !== null &&
      isWithinConsumptionTolerance(
        slot.instant,
        target.scheduledDate.toISOString(),
      ),
  );
}

export function resolveWriteBrief(override: string | undefined): string {
  return override?.trim() || 'Draft';
}

export async function pruneVanishedReservations(
  organizationId: string,
  cadence: CadenceRecord,
  reservationDelegate: ReservationDelegate,
): Promise<void> {
  const expansionInput = {
    cadenceId: cadence.id,
    credentialId: cadence.credentialId,
    ...(cadence.endsAt ? { endsAt: cadence.endsAt.toISOString() } : {}),
    format: cadence.format as PostCategory,
    intervalMinutes: cadence.intervalMinutes,
    ...(cadence.maxOccurrences
      ? { maxOccurrences: cadence.maxOccurrences }
      : {}),
    startsAt: cadence.startsAt.toISOString(),
    timezone: cadence.timezone,
    windowEndMinute: cadence.windowEndMinute,
    windowStartMinute: cadence.windowStartMinute,
  };
  const reservations = await reservationDelegate.findMany({
    where: scopedWhere(organizationId, { cadenceId: cadence.id }),
  });
  const vanishedIds: string[] = [];
  for (const reservation of reservations) {
    if (isConsumedReservation(reservation)) {
      continue;
    }
    const instant = reservation.instant.toISOString();
    const expanded = expandCadenceOccurrences(expansionInput, {
      end: instant,
      start: instant,
    });
    if (
      !expanded.success ||
      !expanded.occurrences.some(
        (occurrence) => occurrence.instantUtc === instant,
      )
    ) {
      vanishedIds.push(reservation.id);
    }
  }
  if (vanishedIds.length === 0) {
    return;
  }

  await reservationDelegate.updateMany({
    data: { isDeleted: true },
    where: scopedWhere(organizationId, {
      cadenceId: cadence.id,
      id: { in: vanishedIds },
    }),
  });
}

export function projectedSlot(
  cadence: IPostingCadence,
  identityKey: string,
  instantUtc: string,
): ICalendarSlot {
  return {
    brandId: cadence.brandId,
    cadenceId: cadence.id,
    credentialId: cadence.credentialId,
    format: cadence.format,
    generatedItemId: null,
    generatedItemType: null,
    id: identityKey,
    identityKey,
    instant: instantUtc,
    lastFailureReason: null,
    resolvedBrief: cadence.brief ?? '',
    state: CalendarSlotState.MISSING,
    timezone: cadence.timezone,
  };
}

export function mergeReservation(
  slot: ICalendarSlot,
  reservation?: ReservationRecord,
): ICalendarSlot {
  if (!reservation) {
    return slot;
  }
  return {
    ...slot,
    generatedItemId: reservation.generatedItemId,
    generatedItemType:
      reservation.generatedItemType as CalendarSlotItemType | null,
    lastFailureReason: reservation.lastFailureReason,
    state: reservation.state as CalendarSlotState,
  };
}

export function reservationToSlot(
  reservation: ReservationRecord,
  resolvedBrief: string,
): ICalendarSlot {
  return {
    brandId: reservation.brandId,
    cadenceId: reservation.cadenceId,
    credentialId: reservation.credentialId,
    format: reservation.format as PostCategory,
    generatedItemId: reservation.generatedItemId,
    generatedItemType:
      reservation.generatedItemType as CalendarSlotItemType | null,
    id: reservation.identityKey,
    identityKey: reservation.identityKey,
    instant: reservation.instant.toISOString(),
    lastFailureReason: reservation.lastFailureReason,
    resolvedBrief,
    state: reservation.state as CalendarSlotState,
    timezone: reservation.timezone,
  };
}

export function toCadence(row: CadenceRecord): IPostingCadence {
  return {
    brief: row.brief,
    brandId: row.brandId,
    createdAt: row.createdAt.toISOString(),
    credentialId: row.credentialId,
    endsAt: row.endsAt?.toISOString() ?? null,
    format: row.format as PostCategory,
    generateLanding: row.generateLanding as CadenceGenerateLanding,
    id: row.id,
    intervalMinutes: row.intervalMinutes,
    isDeleted: row.isDeleted ?? false,
    label: row.label,
    maxOccurrences: row.maxOccurrences,
    organizationId: row.organizationId,
    startsAt: row.startsAt.toISOString(),
    status: row.status as PostingCadenceStatus,
    timezone: row.timezone,
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId,
    windowEndMinute: row.windowEndMinute,
    windowStartMinute: row.windowStartMinute,
  };
}

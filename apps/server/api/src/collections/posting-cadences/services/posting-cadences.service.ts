import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import type { BookCalendarSlotDto } from '@api/collections/posting-cadences/dto/calendar-slot-action.dto';
import type { CreatePostingCadenceDto } from '@api/collections/posting-cadences/dto/create-posting-cadence.dto';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  buildSlotIdentityKey,
  expandCadenceOccurrences,
  isWithinConsumptionTolerance,
  MAX_CADENCE_SPAN_DAYS,
} from '@api-types/contracts/cadence-expansion.contract';
import {
  CadenceGenerateLanding,
  CalendarSlotItemType,
  CalendarSlotState,
  fromPrismaCredentialPlatform,
  PostCategory,
  PostingCadenceStatus,
  ReleaseStatus,
} from '@genfeedai/enums';
import type {
  ICalendarSlot,
  ICalendarSlotFillResult,
  IPostingCadence,
} from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type CadenceRecord = {
  brief: string | null;
  brandId: string;
  createdAt: Date;
  credentialId: string;
  endsAt: Date | null;
  format: string;
  generateLanding: string;
  id: string;
  intervalMinutes: number;
  label: string | null;
  maxOccurrences: number | null;
  organizationId: string;
  startsAt: Date;
  status: string;
  timezone: string;
  updatedAt: Date;
  userId: string;
  windowEndMinute: number;
  windowStartMinute: number;
};

type ReservationRecord = {
  brandId: string;
  cadenceId: string | null;
  credentialId: string;
  format: string;
  generatedItemId: string | null;
  generatedItemType: string | null;
  id: string;
  identityKey: string;
  instant: Date;
  lastFailureReason: string | null;
  state: string;
  timezone: string;
};

type CadenceDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<CadenceRecord>;
  findFirst: (args: {
    where: Record<string, unknown>;
  }) => Promise<CadenceRecord | null>;
  findMany: (args: {
    orderBy?: unknown;
    where: Record<string, unknown>;
  }) => Promise<CadenceRecord[]>;
};

type ReservationDelegate = {
  create: (args: {
    data: Record<string, unknown>;
  }) => Promise<ReservationRecord>;
  findFirst: (args: {
    where: Record<string, unknown>;
  }) => Promise<ReservationRecord | null>;
  update: (args: {
    data: Record<string, unknown>;
    where: { id: string };
  }) => Promise<ReservationRecord>;
  findMany: (args: {
    where: Record<string, unknown>;
  }) => Promise<ReservationRecord[]>;
};

type MatchingTarget = {
  category: string | null;
  credentialId: string | null;
  groupId: string | null;
  id: string;
  scheduledDate: Date | null;
};

@Injectable()
export class PostingCadencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postGroupsService: PostGroupsService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreatePostingCadenceDto,
  ): Promise<IPostingCadence> {
    if (!dto.endsAt && dto.maxOccurrences === undefined) {
      throw new BadRequestException(
        'A cadence requires an end date or a max occurrence count.',
      );
    }
    if (dto.windowEndMinute < dto.windowStartMinute) {
      throw new BadRequestException(
        'windowEndMinute must be on or after windowStartMinute.',
      );
    }

    const startsAt = new Date(dto.startsAt);
    if (dto.endsAt) {
      const endsAt = new Date(dto.endsAt);
      const maxEnd = new Date(
        startsAt.getTime() + MAX_CADENCE_SPAN_DAYS * 24 * 60 * 60 * 1000,
      );
      if (endsAt > maxEnd) {
        throw new BadRequestException(
          'A cadence end date cannot be more than 365 days after start.',
        );
      }
    }

    const credential = await this.prisma.credential.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        brandId: dto.brandId,
        id: dto.credentialId,
      }),
    });
    if (!credential) {
      throw new NotFoundException('Credential', dto.credentialId);
    }

    const created = await this.cadenceDelegate().create({
      data: {
        brief: dto.brief ?? null,
        brandId: dto.brandId,
        credentialId: dto.credentialId,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        format: dto.format,
        generateLanding: dto.generateLanding ?? CadenceGenerateLanding.DRAFT,
        intervalMinutes: dto.intervalMinutes,
        label: dto.label ?? null,
        maxOccurrences: dto.maxOccurrences ?? null,
        organizationId,
        startsAt,
        status: PostingCadenceStatus.ACTIVE,
        timezone: dto.timezone ?? 'UTC',
        userId,
        windowEndMinute: dto.windowEndMinute,
        windowStartMinute: dto.windowStartMinute,
      },
    });

    return this.toCadence(created);
  }

  async list(
    organizationId: string,
    brandId: string,
  ): Promise<IPostingCadence[]> {
    const rows = await this.cadenceDelegate().findMany({
      orderBy: { createdAt: 'asc' },
      where: scopedWhere(organizationId, {
        brandId,
        status: PostingCadenceStatus.ACTIVE,
      }),
    });
    return rows.map((row) => this.toCadence(row));
  }

  async listSlots(
    organizationId: string,
    brandId: string,
    startDate: string,
    endDate: string,
  ): Promise<ICalendarSlot[]> {
    const cadences = await this.list(organizationId, brandId);
    const range = { end: endDate, start: startDate };
    const collapsed = new Map<string, ICalendarSlot>();

    for (const cadence of cadences) {
      const expanded = expandCadenceOccurrences(
        {
          cadenceId: cadence.id,
          credentialId: cadence.credentialId,
          ...(cadence.endsAt ? { endsAt: cadence.endsAt } : {}),
          format: cadence.format,
          intervalMinutes: cadence.intervalMinutes,
          ...(cadence.maxOccurrences
            ? { maxOccurrences: cadence.maxOccurrences }
            : {}),
          startsAt: cadence.startsAt,
          timezone: cadence.timezone,
          windowEndMinute: cadence.windowEndMinute,
          windowStartMinute: cadence.windowStartMinute,
        },
        range,
      );
      if (!expanded.success) {
        continue;
      }
      for (const occurrence of expanded.occurrences) {
        const collapseKey = [
          cadence.credentialId,
          cadence.format,
          occurrence.instantUtc,
        ].join('|');
        if (collapsed.has(collapseKey)) {
          continue;
        }
        collapsed.set(
          collapseKey,
          this.projectedSlot(
            cadence,
            occurrence.identityKey,
            occurrence.instantUtc,
          ),
        );
      }
    }

    const reservations = await this.reservationDelegate().findMany({
      where: scopedWhere(organizationId, {
        brandId,
        instant: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    });
    const reservationByKey = new Map(
      reservations.map((reservation) => [reservation.identityKey, reservation]),
    );

    const targets = (await this.prisma.post.findMany({
      select: {
        category: true,
        credentialId: true,
        groupId: true,
        id: true,
        scheduledDate: true,
      },
      where: scopedWhere(organizationId, {
        brandId,
        parentId: null,
        scheduledDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    })) as MatchingTarget[];

    const slots: ICalendarSlot[] = [];
    for (const slot of collapsed.values()) {
      const reservation = reservationByKey.get(slot.identityKey);
      if (reservation?.state === CalendarSlotState.SKIPPED) {
        continue;
      }
      if (this.matchingTarget(targets, slot)) {
        continue;
      }
      slots.push(this.mergeReservation(slot, reservation));
    }

    for (const reservation of reservations) {
      if (
        reservation.cadenceId ||
        reservation.state === CalendarSlotState.FILLED
      ) {
        continue;
      }
      if (reservation.state === CalendarSlotState.SKIPPED) {
        continue;
      }
      const manual: ICalendarSlot = {
        brandId: reservation.brandId,
        cadenceId: null,
        credentialId: reservation.credentialId,
        format: reservation.format as PostCategory,
        generatedItemId: reservation.generatedItemId,
        generatedItemType:
          reservation.generatedItemType as CalendarSlotItemType | null,
        id: reservation.identityKey,
        identityKey: reservation.identityKey,
        instant: reservation.instant.toISOString(),
        lastFailureReason: reservation.lastFailureReason,
        resolvedBrief: '',
        state: reservation.state as CalendarSlotState,
        timezone: reservation.timezone,
      };
      if (this.matchingTarget(targets, manual)) {
        continue;
      }
      slots.push(manual);
    }

    return slots.sort((left, right) =>
      left.instant.localeCompare(right.instant),
    );
  }

  async book(
    organizationId: string,
    dto: BookCalendarSlotDto,
  ): Promise<ICalendarSlot> {
    const identityKey = buildSlotIdentityKey({
      cadenceId: null,
      credentialId: dto.credentialId,
      format: dto.format,
      instantUtc: new Date(dto.instant).toISOString(),
    });
    const existing = await this.reservationDelegate().findFirst({
      where: scopedWhere(organizationId, { identityKey }),
    });
    if (existing) {
      return this.reservationToSlot(existing, '');
    }

    const created = await this.reservationDelegate().create({
      data: {
        brandId: dto.brandId,
        cadenceId: null,
        credentialId: dto.credentialId,
        format: dto.format,
        identityKey,
        instant: new Date(dto.instant),
        organizationId,
        state: CalendarSlotState.MISSING,
        timezone: dto.timezone ?? 'UTC',
      },
    });
    return this.reservationToSlot(created, '');
  }

  async generate(
    organizationId: string,
    userId: string,
    identityKey: string,
    brief?: string,
  ): Promise<ICalendarSlotFillResult> {
    return this.fillSlot(organizationId, userId, identityKey, brief, false);
  }

  async write(
    organizationId: string,
    userId: string,
    identityKey: string,
  ): Promise<ICalendarSlotFillResult> {
    return this.fillSlot(organizationId, userId, identityKey, undefined, true);
  }

  private async fillSlot(
    organizationId: string,
    userId: string,
    identityKey: string,
    brief: string | undefined,
    isWrite: boolean,
  ): Promise<ICalendarSlotFillResult> {
    const existing = await this.reservationDelegate().findFirst({
      where: scopedWhere(organizationId, { identityKey }),
    });
    if (
      existing?.state === CalendarSlotState.FILLED &&
      existing.generatedItemId
    ) {
      const release = await this.postGroupsService.getOne(
        organizationId,
        existing.generatedItemId,
      );
      const targetId = release.targets?.[0]?.id ?? existing.generatedItemId;
      return {
        releaseId: release.id,
        slot: this.reservationToSlot(existing, brief ?? ''),
        targetId,
      };
    }
    if (existing?.state === CalendarSlotState.GENERATING && !isWrite) {
      throw new BadRequestException('This slot is already generating.');
    }

    const slot = await this.resolveIdentity(organizationId, identityKey);
    if (slot.state === CalendarSlotState.GENERATING && !isWrite) {
      throw new BadRequestException('This slot is already generating.');
    }

    const reservation = await this.upsertReservation(
      organizationId,
      slot,
      CalendarSlotState.GENERATING,
    );

    try {
      const credential = await this.prisma.credential.findFirst({
        where: scopedWhere(organizationId, { id: slot.credentialId }),
      });
      if (!credential) {
        throw new NotFoundException('Credential', slot.credentialId);
      }
      const platform = fromPrismaCredentialPlatform(credential.platform);
      if (!platform) {
        throw new BadRequestException(
          'The credential platform is unsupported.',
        );
      }

      const resolvedBrief = this.resolveBrief(slot, brief, isWrite);
      const landing = isWrite
        ? ReleaseStatus.DRAFT
        : slot.cadenceId
          ? await this.landingForCadence(organizationId, slot.cadenceId)
          : ReleaseStatus.DRAFT;

      const release = await this.postGroupsService.create(
        organizationId,
        userId,
        {
          baseContent: resolvedBrief,
          brandId: slot.brandId,
          idempotencyKey: identityKey,
          scheduledDate: slot.instant,
          status: landing,
          targets: [
            {
              credentialId: slot.credentialId,
              platform,
              scheduledDate: slot.instant,
            },
          ],
          timezone: slot.timezone,
          title: isWrite ? 'Untitled' : 'Cadence post',
        },
        identityKey,
        { source: 'calendar-slot' },
      );

      const targetId = release.targets?.[0]?.id ?? release.id;
      if (release.targets?.[0]?.id) {
        await this.prisma.post.updateMany({
          data: { category: slot.format },
          where: scopedWhere(organizationId, { id: release.targets[0].id }),
        });
      }

      const filled = await this.reservationDelegate().update({
        data: {
          generatedItemId: release.id,
          generatedItemType: CalendarSlotItemType.RELEASE,
          lastFailureReason: null,
          state: CalendarSlotState.FILLED,
        },
        where: { id: reservation.id },
      });

      return {
        releaseId: release.id,
        slot: this.reservationToSlot(filled, resolvedBrief),
        targetId,
      };
    } catch (error) {
      await this.reservationDelegate().update({
        data: {
          lastFailureReason:
            error instanceof Error ? error.message : 'Generation failed.',
          state: CalendarSlotState.GENERATE_FAILED,
        },
        where: { id: reservation.id },
      });
      this.logger.error('Calendar slot fill failed', error);
      throw error;
    }
  }

  private async resolveIdentity(
    organizationId: string,
    identityKey: string,
  ): Promise<ICalendarSlot> {
    const reservation = await this.reservationDelegate().findFirst({
      where: scopedWhere(organizationId, { identityKey }),
    });
    if (reservation) {
      return this.reservationToSlot(reservation, '');
    }

    const [cadenceId, credentialId, format, instant] = identityKey.split('|');
    if (!credentialId || !format || !instant) {
      throw new BadRequestException('The slot identity is invalid.');
    }
    if (cadenceId === 'manual') {
      throw new NotFoundException('Calendar slot', identityKey);
    }

    const cadence = await this.cadenceDelegate().findFirst({
      where: scopedWhere(organizationId, { id: cadenceId }),
    });
    if (!cadence) {
      throw new NotFoundException('Posting cadence', cadenceId);
    }
    return this.projectedSlot(this.toCadence(cadence), identityKey, instant);
  }

  private async upsertReservation(
    organizationId: string,
    slot: ICalendarSlot,
    state: CalendarSlotState,
  ): Promise<ReservationRecord> {
    const existing = await this.reservationDelegate().findFirst({
      where: scopedWhere(organizationId, { identityKey: slot.identityKey }),
    });
    if (existing) {
      return this.reservationDelegate().update({
        data: { state },
        where: { id: existing.id },
      });
    }
    return this.reservationDelegate().create({
      data: {
        brandId: slot.brandId,
        cadenceId: slot.cadenceId,
        credentialId: slot.credentialId,
        format: slot.format,
        identityKey: slot.identityKey,
        instant: new Date(slot.instant),
        organizationId,
        state,
        timezone: slot.timezone,
      },
    });
  }

  private async landingForCadence(
    organizationId: string,
    cadenceId: string,
  ): Promise<ReleaseStatus> {
    const cadence = await this.cadenceDelegate().findFirst({
      where: scopedWhere(organizationId, { id: cadenceId }),
    });
    return cadence?.generateLanding === CadenceGenerateLanding.SCHEDULED
      ? ReleaseStatus.SCHEDULED
      : ReleaseStatus.DRAFT;
  }

  private matchingTarget(
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

  private resolveBrief(
    slot: ICalendarSlot,
    override: string | undefined,
    isWrite: boolean,
  ): string {
    if (isWrite) {
      return override?.trim() || 'Draft';
    }
    if (override?.trim()) {
      return override.trim();
    }
    if (slot.resolvedBrief.trim()) {
      return slot.resolvedBrief.trim();
    }
    return 'Draft';
  }

  private projectedSlot(
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

  private mergeReservation(
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

  private reservationToSlot(
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

  private toCadence(row: CadenceRecord): IPostingCadence {
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
      isDeleted: false,
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

  private cadenceDelegate(): CadenceDelegate {
    return (this.prisma as unknown as { postingCadence: CadenceDelegate })
      .postingCadence;
  }

  private reservationDelegate(): ReservationDelegate {
    return (this.prisma as unknown as { slotReservation: ReservationDelegate })
      .slotReservation;
  }
}

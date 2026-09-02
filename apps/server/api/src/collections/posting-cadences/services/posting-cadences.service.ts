import { createHash } from 'node:crypto';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import type { BookCalendarSlotDto } from '@api/collections/posting-cadences/dto/calendar-slot-action.dto';
import type { CreatePostingCadenceDto } from '@api/collections/posting-cadences/dto/create-posting-cadence.dto';
import type { UpdatePostingCadenceDto } from '@api/collections/posting-cadences/dto/update-posting-cadence.dto';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  type ApiKeyPublishingContext,
  assertApiKeyPublishingScope,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  buildSlotIdentityKey,
  collapseOverlappingCadenceOccurrences,
  expandCadenceOccurrences,
} from '@api-types/contracts/cadence-expansion.contract';
import {
  ArticleStatus,
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
  ICalendarSlotBulkGenerateResult,
  ICalendarSlotFillResult,
  IPostingCadence,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  CadenceDelegate,
  CadenceRecord,
  MatchingTarget,
  ReservationDelegate,
  ReservationRecord,
} from './posting-cadence.types';
import {
  assertCadenceBounds,
  isConsumedReservation,
  matchingTarget,
  mergeReservation,
  projectedSlot,
  pruneVanishedReservations,
  reservationToSlot,
  resolveWriteBrief,
  toArticleSlug,
  toCadence,
} from './posting-cadence.utils';
import { PostingCadenceCopyService } from './posting-cadence-copy.service';
import { PostingCadenceValidationService } from './posting-cadence-validation.service';

@Injectable()
export class PostingCadencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postGroupsService: PostGroupsService,
    private readonly articlesService: ArticlesService,
    private readonly copyService: PostingCadenceCopyService,
    private readonly validationService: PostingCadenceValidationService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreatePostingCadenceDto,
  ): Promise<IPostingCadence> {
    const startsAt = new Date(dto.startsAt);
    assertCadenceBounds({
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      maxOccurrences: dto.maxOccurrences ?? null,
      startsAt,
      windowEndMinute: dto.windowEndMinute,
      windowStartMinute: dto.windowStartMinute,
    });
    await this.validationService.assertCredential(
      organizationId,
      dto.brandId,
      dto.credentialId,
    );

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
        isDeleted: false,
        organizationId,
        startsAt,
        status: PostingCadenceStatus.ACTIVE,
        timezone: dto.timezone ?? 'UTC',
        userId,
        windowEndMinute: dto.windowEndMinute,
        windowStartMinute: dto.windowStartMinute,
      },
    });

    return toCadence(created);
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
    return rows.map(toCadence);
  }

  async listSlots(
    organizationId: string,
    brandId: string,
    startDate: string,
    endDate: string,
  ): Promise<ICalendarSlot[]> {
    const cadences = await this.list(organizationId, brandId);
    const range = { end: endDate, start: startDate };
    const projected: Array<{
      cadenceCreatedAt: string;
      cadenceId: string;
      credentialId: string;
      format: string;
      instantUtc: string;
      slot: ICalendarSlot;
    }> = [];

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
        projected.push({
          cadenceCreatedAt: cadence.createdAt,
          cadenceId: cadence.id,
          credentialId: cadence.credentialId,
          format: cadence.format,
          instantUtc: occurrence.instantUtc,
          slot: projectedSlot(
            cadence,
            occurrence.identityKey,
            occurrence.instantUtc,
          ),
        });
      }
    }
    const collapsed = new Map(
      collapseOverlappingCadenceOccurrences(projected).map((occurrence) => [
        occurrence.slot.identityKey,
        occurrence.slot,
      ]),
    );

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
      if (isConsumedReservation(reservation)) {
        continue;
      }
      if (matchingTarget(targets, slot)) {
        continue;
      }
      slots.push(mergeReservation(slot, reservation));
    }

    for (const reservation of reservations) {
      if (reservation.cadenceId || isConsumedReservation(reservation)) {
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
      if (matchingTarget(targets, manual)) {
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
    const reservation = await this.ensureReservation(organizationId, {
      brandId: dto.brandId,
      cadenceId: null,
      credentialId: dto.credentialId,
      format: dto.format,
      generatedItemId: null,
      generatedItemType: null,
      id: identityKey,
      identityKey,
      instant: new Date(dto.instant).toISOString(),
      lastFailureReason: null,
      resolvedBrief: '',
      state: CalendarSlotState.MISSING,
      timezone: dto.timezone ?? 'UTC',
    });
    return reservationToSlot(reservation, '');
  }

  async generate(
    organizationId: string,
    userId: string,
    identityKey: string,
    brief?: string,
    apiKeyContext?: ApiKeyPublishingContext,
    campaignId?: string,
  ): Promise<ICalendarSlotFillResult> {
    return this.fillSlot(
      organizationId,
      userId,
      identityKey,
      brief,
      false,
      apiKeyContext,
      campaignId,
    );
  }

  async generateBulk(
    organizationId: string,
    userId: string,
    identityKeys: string[],
    confirmedCount: number,
    brief?: string,
    apiKeyContext?: ApiKeyPublishingContext,
    signal?: AbortSignal,
    campaignId?: string,
  ): Promise<ICalendarSlotBulkGenerateResult> {
    const uniqueKeys: string[] = [];
    const seen = new Set<string>();
    for (const identityKey of identityKeys) {
      if (seen.has(identityKey)) {
        continue;
      }
      seen.add(identityKey);
      uniqueKeys.push(identityKey);
    }
    if (confirmedCount !== uniqueKeys.length) {
      throw new BadRequestException(
        `Confirm ${uniqueKeys.length} slots to generate them.`,
      );
    }

    const completed: ICalendarSlot[] = [];
    let isCancelled = false;
    let isCreditsExhausted = false;
    let remainingIdentityKeys: string[] = [];

    for (let index = 0; index < uniqueKeys.length; index += 1) {
      if (signal?.aborted) {
        isCancelled = true;
        remainingIdentityKeys = uniqueKeys.slice(index);
        break;
      }

      const identityKey = uniqueKeys[index];
      if (!identityKey) {
        continue;
      }

      try {
        const result = await this.generate(
          organizationId,
          userId,
          identityKey,
          brief,
          apiKeyContext,
          campaignId,
        );
        completed.push({
          ...result.slot,
          generatedItemId: result.targetId,
        });
      } catch (error) {
        if (error instanceof InsufficientCreditsException) {
          isCreditsExhausted = true;
          await this.restoreMissingAfterCreditExhaustion(
            organizationId,
            identityKey,
          );
          remainingIdentityKeys = uniqueKeys.slice(index);
          break;
        }
        throw error;
      }
    }

    return {
      completed,
      completedCount: completed.length,
      id: createHash('sha256')
        .update(uniqueKeys.join('\n'))
        .digest('hex')
        .slice(0, 24),
      isCancelled,
      isCreditsExhausted,
      remainingCount: remainingIdentityKeys.length,
      remainingIdentityKeys,
    };
  }

  async write(
    organizationId: string,
    userId: string,
    identityKey: string,
    apiKeyContext?: ApiKeyPublishingContext,
    campaignId?: string,
  ): Promise<ICalendarSlotFillResult> {
    return this.fillSlot(
      organizationId,
      userId,
      identityKey,
      undefined,
      true,
      apiKeyContext,
      campaignId,
    );
  }

  async skip(
    organizationId: string,
    identityKey: string,
  ): Promise<ICalendarSlot> {
    const existing = await this.findReservation(organizationId, identityKey);
    if (
      existing?.state === CalendarSlotState.FILLED &&
      existing.generatedItemId
    ) {
      throw new BadRequestException('A filled slot cannot be skipped.');
    }
    if (existing?.state === CalendarSlotState.GENERATING) {
      throw new BadRequestException(
        'Cancel the in-flight generate before skipping this slot.',
      );
    }
    if (existing?.state === CalendarSlotState.SKIPPED) {
      return reservationToSlot(existing, '');
    }

    const slot = await this.resolveIdentity(organizationId, identityKey);
    const reservation =
      existing ?? (await this.ensureReservation(organizationId, slot));
    const skipped = await this.transitionReservation(
      organizationId,
      reservation,
      [CalendarSlotState.MISSING, CalendarSlotState.GENERATE_FAILED],
      { state: CalendarSlotState.SKIPPED },
    );
    if (skipped) {
      return reservationToSlot(skipped, slot.resolvedBrief);
    }

    const winner = await this.findReservation(organizationId, identityKey);
    if (winner?.state === CalendarSlotState.SKIPPED) {
      return reservationToSlot(winner, slot.resolvedBrief);
    }
    if (winner?.state === CalendarSlotState.GENERATING) {
      throw new BadRequestException(
        'Cancel the in-flight generate before skipping this slot.',
      );
    }
    throw new BadRequestException('This slot can no longer be skipped.');
  }

  async cancel(
    organizationId: string,
    identityKey: string,
  ): Promise<ICalendarSlot> {
    const existing = await this.findReservation(organizationId, identityKey);
    if (!existing || existing.state !== CalendarSlotState.GENERATING) {
      throw new BadRequestException(
        'Only an in-flight generate can be cancelled.',
      );
    }

    const updated = await this.transitionReservation(
      organizationId,
      existing,
      [CalendarSlotState.GENERATING],
      {
        generatedItemId: null,
        generatedItemType: null,
        lastFailureReason: null,
        state: CalendarSlotState.MISSING,
      },
    );
    if (!updated) {
      throw new BadRequestException(
        'Only an in-flight generate can be cancelled.',
      );
    }
    return reservationToSlot(updated, '');
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdatePostingCadenceDto,
  ): Promise<IPostingCadence> {
    const existing = await this.cadenceDelegate().findFirst({
      where: scopedWhere(organizationId, { id }),
    });
    if (!existing) {
      throw new NotFoundException('Posting cadence', id);
    }

    const nextEndsAt =
      dto.endsAt !== undefined
        ? dto.endsAt
          ? new Date(dto.endsAt)
          : null
        : existing.endsAt;
    const nextMaxOccurrences =
      dto.maxOccurrences !== undefined
        ? (dto.maxOccurrences ?? null)
        : existing.maxOccurrences;
    const nextStartsAt = dto.startsAt
      ? new Date(dto.startsAt)
      : existing.startsAt;
    const nextWindowEndMinute = dto.windowEndMinute ?? existing.windowEndMinute;
    const nextWindowStartMinute =
      dto.windowStartMinute ?? existing.windowStartMinute;

    assertCadenceBounds({
      endsAt: nextEndsAt,
      maxOccurrences: nextMaxOccurrences,
      startsAt: nextStartsAt,
      windowEndMinute: nextWindowEndMinute,
      windowStartMinute: nextWindowStartMinute,
    });

    const nextCredentialId = dto.credentialId ?? existing.credentialId;
    const nextBrandId = dto.brandId ?? existing.brandId;
    if (
      nextCredentialId !== existing.credentialId ||
      nextBrandId !== existing.brandId
    ) {
      await this.validationService.assertCredential(
        organizationId,
        nextBrandId,
        nextCredentialId,
      );
    }

    const updated = await this.cadenceDelegate().update({
      data: {
        brief: dto.brief !== undefined ? (dto.brief ?? null) : existing.brief,
        brandId: nextBrandId,
        credentialId: nextCredentialId,
        endsAt: nextEndsAt,
        format: dto.format ?? existing.format,
        generateLanding: dto.generateLanding ?? existing.generateLanding,
        intervalMinutes: dto.intervalMinutes ?? existing.intervalMinutes,
        label: dto.label !== undefined ? (dto.label ?? null) : existing.label,
        maxOccurrences: nextMaxOccurrences,
        startsAt: nextStartsAt,
        timezone: dto.timezone ?? existing.timezone,
        windowEndMinute: nextWindowEndMinute,
        windowStartMinute: nextWindowStartMinute,
      },
      where: scopedWhere(organizationId, { id }),
    });

    await pruneVanishedReservations(
      organizationId,
      updated,
      this.reservationDelegate(),
    );
    return toCadence(updated);
  }

  async remove(organizationId: string, id: string): Promise<IPostingCadence> {
    const existing = await this.cadenceDelegate().findFirst({
      where: scopedWhere(organizationId, { id }),
    });
    if (!existing) {
      throw new NotFoundException('Posting cadence', id);
    }

    const updated = await this.cadenceDelegate().update({
      data: {
        isDeleted: true,
        status: PostingCadenceStatus.ARCHIVED,
      },
      where: scopedWhere(organizationId, { id }),
    });
    return toCadence(updated);
  }

  private async fillSlot(
    organizationId: string,
    userId: string,
    identityKey: string,
    brief: string | undefined,
    isWrite: boolean,
    apiKeyContext?: ApiKeyPublishingContext,
    campaignId?: string,
  ): Promise<ICalendarSlotFillResult> {
    const existing = await this.findReservation(organizationId, identityKey);
    if (existing?.state === CalendarSlotState.SKIPPED) {
      throw new BadRequestException('This slot was skipped.');
    }
    if (
      existing?.state === CalendarSlotState.FILLED &&
      existing.generatedItemId
    ) {
      return this.filledResult(organizationId, existing, brief);
    }
    if (existing?.state === CalendarSlotState.GENERATING) {
      throw new BadRequestException('This slot is already generating.');
    }

    const slot = await this.resolveIdentity(organizationId, identityKey);
    if (slot.state === CalendarSlotState.SKIPPED) {
      throw new BadRequestException('This slot was skipped.');
    }
    if (slot.state === CalendarSlotState.GENERATING) {
      throw new BadRequestException('This slot is already generating.');
    }

    const candidate =
      existing ?? (await this.ensureReservation(organizationId, slot));
    if (candidate.state === CalendarSlotState.SKIPPED) {
      throw new BadRequestException('This slot was skipped.');
    }
    if (
      candidate.state === CalendarSlotState.FILLED &&
      candidate.generatedItemId
    ) {
      return this.filledResult(organizationId, candidate, brief);
    }
    if (candidate.state === CalendarSlotState.GENERATING) {
      throw new BadRequestException('This slot is already generating.');
    }

    const reservation = await this.transitionReservation(
      organizationId,
      candidate,
      [CalendarSlotState.MISSING, CalendarSlotState.GENERATE_FAILED],
      {
        generatedItemId: null,
        generatedItemType: null,
        lastFailureReason: null,
        state: CalendarSlotState.GENERATING,
      },
    );
    if (!reservation) {
      const winner = await this.findReservation(organizationId, identityKey);
      if (
        winner?.state === CalendarSlotState.FILLED &&
        winner.generatedItemId
      ) {
        return this.filledResult(organizationId, winner, brief);
      }
      if (winner?.state === CalendarSlotState.SKIPPED) {
        throw new BadRequestException('This slot was skipped.');
      }
      throw new BadRequestException('This slot is already generating.');
    }

    try {
      const cadence = slot.cadenceId
        ? await this.cadenceDelegate().findFirst({
            where: scopedWhere(organizationId, { id: slot.cadenceId }),
          })
        : null;
      const landing = isWrite
        ? ReleaseStatus.DRAFT
        : cadence?.generateLanding === CadenceGenerateLanding.SCHEDULED
          ? ReleaseStatus.SCHEDULED
          : ReleaseStatus.DRAFT;
      assertApiKeyPublishingScope(
        apiKeyContext ?? {},
        landing === ReleaseStatus.DRAFT ? 'draft' : 'schedule',
      );
      const resolvedBrief = isWrite
        ? resolveWriteBrief(brief)
        : await this.copyService.generateCampaignCopy(
            organizationId,
            userId,
            slot,
            cadence,
            brief,
          );

      if (slot.format === PostCategory.ARTICLE) {
        return await this.fillArticleSlot(
          organizationId,
          userId,
          slot,
          reservation,
          cadence,
          resolvedBrief,
          isWrite,
        );
      }

      return await this.fillPostSlot(
        organizationId,
        userId,
        identityKey,
        slot,
        reservation,
        cadence,
        resolvedBrief,
        isWrite,
        landing,
        apiKeyContext,
        campaignId,
      );
    } catch (error) {
      await this.reservationDelegate().updateMany({
        data: {
          lastFailureReason:
            error instanceof Error ? error.message : 'Generation failed.',
          state: CalendarSlotState.GENERATE_FAILED,
        },
        where: scopedWhere(organizationId, {
          id: reservation.id,
          state: CalendarSlotState.GENERATING,
        }),
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
      return reservationToSlot(reservation, '');
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
    return projectedSlot(toCadence(cadence), identityKey, instant);
  }

  private async ensureReservation(
    organizationId: string,
    slot: ICalendarSlot,
  ): Promise<ReservationRecord> {
    return this.reservationDelegate().upsert({
      create: {
        brandId: slot.brandId,
        cadenceId: slot.cadenceId,
        credentialId: slot.credentialId,
        format: slot.format,
        identityKey: slot.identityKey,
        instant: new Date(slot.instant),
        organizationId,
        state: CalendarSlotState.MISSING,
        timezone: slot.timezone,
      },
      update: { isDeleted: false },
      where: {
        organizationId_identityKey: {
          identityKey: slot.identityKey,
          organizationId,
        },
      },
    });
  }

  private findReservation(
    organizationId: string,
    identityKey: string,
  ): Promise<ReservationRecord | null> {
    return this.reservationDelegate().findFirst({
      where: scopedWhere(organizationId, { identityKey }),
    });
  }

  private async restoreMissingAfterCreditExhaustion(
    organizationId: string,
    identityKey: string,
  ): Promise<void> {
    await this.reservationDelegate().updateMany({
      data: {
        generatedItemId: null,
        generatedItemType: null,
        lastFailureReason: null,
        state: CalendarSlotState.MISSING,
      },
      where: scopedWhere(organizationId, {
        identityKey,
        state: {
          in: [CalendarSlotState.GENERATING, CalendarSlotState.GENERATE_FAILED],
        },
      }),
    });
  }

  private async transitionReservation(
    organizationId: string,
    reservation: ReservationRecord,
    fromStates: CalendarSlotState[],
    data: Record<string, unknown>,
  ): Promise<ReservationRecord | null> {
    const transitioned = await this.reservationDelegate().updateMany({
      data,
      where: scopedWhere(organizationId, {
        id: reservation.id,
        state: fromStates.length === 1 ? fromStates[0] : { in: fromStates },
      }),
    });
    if (transitioned.count === 0) {
      return null;
    }
    return { ...reservation, ...data } as ReservationRecord;
  }

  private async completeGeneratingReservation(
    organizationId: string,
    reservation: ReservationRecord,
    data: Record<string, unknown>,
  ): Promise<ReservationRecord> {
    const completed = await this.transitionReservation(
      organizationId,
      reservation,
      [CalendarSlotState.GENERATING],
      data,
    );
    if (!completed) {
      throw new BadRequestException('This generation was cancelled.');
    }
    return completed;
  }

  private async fillArticleSlot(
    organizationId: string,
    userId: string,
    slot: ICalendarSlot,
    reservation: ReservationRecord,
    cadence: CadenceRecord | null,
    resolvedBrief: string,
    isWrite: boolean,
  ): Promise<ICalendarSlotFillResult> {
    const label = isWrite
      ? 'Untitled'
      : cadence?.label?.trim() || 'Campaign article';
    const article = await this.articlesService.createArticle(
      {
        content: resolvedBrief,
        label,
        slug: toArticleSlug(label, slot.identityKey),
        status: ArticleStatus.DRAFT,
        summary: (resolvedBrief.trim() || 'Draft').slice(0, 500),
      },
      userId,
      organizationId,
      slot.brandId,
    );

    const filled = await this.completeGeneratingReservation(
      organizationId,
      reservation,
      {
        generatedItemId: article.id,
        generatedItemType: CalendarSlotItemType.ARTICLE,
        lastFailureReason: null,
        state: CalendarSlotState.FILLED,
      },
    );

    return {
      articleId: article.id,
      slot: reservationToSlot(filled, resolvedBrief),
      targetId: article.id,
    };
  }

  private async fillPostSlot(
    organizationId: string,
    userId: string,
    identityKey: string,
    slot: ICalendarSlot,
    reservation: ReservationRecord,
    cadence: CadenceRecord | null,
    resolvedBrief: string,
    isWrite: boolean,
    landing: ReleaseStatus,
    apiKeyContext?: ApiKeyPublishingContext,
    campaignId?: string,
  ): Promise<ICalendarSlotFillResult> {
    const credential = await this.prisma.credential.findFirst({
      where: scopedWhere(organizationId, { id: slot.credentialId }),
    });
    if (!credential) {
      throw new NotFoundException('Credential', slot.credentialId);
    }
    const platform = fromPrismaCredentialPlatform(credential.platform);
    if (!platform) {
      throw new BadRequestException('The credential platform is unsupported.');
    }
    if (campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        select: { id: true },
        where: scopedWhere(organizationId, {
          brandId: slot.brandId,
          id: campaignId,
        }),
      });
      if (!campaign) {
        throw new NotFoundException('Campaign', campaignId);
      }
    }

    const release = await this.postGroupsService.create(
      organizationId,
      userId,
      {
        baseContent: resolvedBrief,
        brandId: slot.brandId,
        ...(campaignId ? { campaignId } : {}),
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
        title: isWrite ? 'Untitled' : cadence?.label?.trim() || 'Campaign post',
      },
      identityKey,
      { source: 'calendar-slot' },
      apiKeyContext,
    );

    const targetId = release.targets?.[0]?.id ?? release.id;
    if (release.targets?.[0]?.id) {
      await this.prisma.post.updateMany({
        data: { category: slot.format },
        where: scopedWhere(organizationId, { id: release.targets[0].id }),
      });
    }

    const filled = await this.completeGeneratingReservation(
      organizationId,
      reservation,
      {
        generatedItemId: release.id,
        generatedItemType: CalendarSlotItemType.RELEASE,
        lastFailureReason: null,
        state: CalendarSlotState.FILLED,
      },
    );

    return {
      releaseId: release.id,
      slot: reservationToSlot(filled, resolvedBrief),
      targetId,
    };
  }

  private async filledResult(
    organizationId: string,
    existing: ReservationRecord,
    brief: string | undefined,
  ): Promise<ICalendarSlotFillResult> {
    if (
      existing.generatedItemType === CalendarSlotItemType.ARTICLE &&
      existing.generatedItemId
    ) {
      return {
        articleId: existing.generatedItemId,
        slot: reservationToSlot(existing, brief ?? ''),
        targetId: existing.generatedItemId,
      };
    }

    const generatedItemId = existing.generatedItemId;
    if (!generatedItemId) {
      throw new BadRequestException('This slot has no generated item.');
    }

    const release = await this.postGroupsService.getOne(
      organizationId,
      generatedItemId,
    );
    const targetId = release.targets?.[0]?.id ?? generatedItemId;
    return {
      releaseId: release.id,
      slot: reservationToSlot(existing, brief ?? ''),
      targetId,
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

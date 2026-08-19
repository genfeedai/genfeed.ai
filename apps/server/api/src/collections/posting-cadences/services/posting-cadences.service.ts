import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import { buildBrandVoiceSummary } from '@api/collections/brands/utils/brand-context.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import type { BookCalendarSlotDto } from '@api/collections/posting-cadences/dto/calendar-slot-action.dto';
import type { CreatePostingCadenceDto } from '@api/collections/posting-cadences/dto/create-posting-cadence.dto';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import {
  type ApiKeyPublishingContext,
  assertApiKeyPublishingScope,
} from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  buildSlotIdentityKey,
  expandCadenceOccurrences,
  isWithinConsumptionTolerance,
  MAX_CADENCE_SPAN_DAYS,
} from '@api-types/contracts/cadence-expansion.contract';
import {
  buildCadenceSlotGeneratePrompt,
  MAX_SCHEDULED_CAMPAIGN_ITEMS,
} from '@api-types/contracts/cadence-slot-generate.contract';
import { isCloudDeployment } from '@genfeedai/config';
import {
  AGENT_CREDIT_MARGIN_MULTIPLIER,
  AGENT_CREDIT_USD,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  getAgentChatModel,
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  shouldUseLowestCostModelDefaults,
} from '@genfeedai/constants';
import {
  ActivitySource,
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

type BrandContextRow = {
  agentConfig: unknown;
  description: string | null;
  label: string;
  text: string | null;
};

type ScheduledCampaignRow = {
  description: string;
  scheduledDate: Date | null;
};

type TextPricedModel = {
  cost?: number | null;
  inputCostPerMillionTokens?: number | null;
  minCost?: number | null;
  outputCostPerMillionTokens?: number | null;
  pricingType?: string | null;
};

@Injectable()
export class PostingCadencesService {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postGroupsService: PostGroupsService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
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
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<ICalendarSlotFillResult> {
    return this.fillSlot(
      organizationId,
      userId,
      identityKey,
      brief,
      false,
      apiKeyContext,
    );
  }

  async write(
    organizationId: string,
    userId: string,
    identityKey: string,
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<ICalendarSlotFillResult> {
    return this.fillSlot(
      organizationId,
      userId,
      identityKey,
      undefined,
      true,
      apiKeyContext,
    );
  }

  private async fillSlot(
    organizationId: string,
    userId: string,
    identityKey: string,
    brief: string | undefined,
    isWrite: boolean,
    apiKeyContext?: ApiKeyPublishingContext,
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
        ? this.resolveWriteBrief(brief)
        : await this.generateCampaignCopy(
            organizationId,
            userId,
            slot,
            cadence,
            brief,
          );

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
          title: isWrite
            ? 'Untitled'
            : cadence?.label?.trim() || 'Campaign post',
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

  private resolveWriteBrief(override: string | undefined): string {
    return override?.trim() || 'Draft';
  }

  private async generateCampaignCopy(
    organizationId: string,
    userId: string,
    slot: ICalendarSlot,
    cadence: CadenceRecord | null,
    overrideBrief: string | undefined,
  ): Promise<string> {
    const modelKey = this.resolveGenerateModelKey();
    const pricedModel = await this.getPricedGenerateModel(modelKey);
    await this.assertGenerateCreditsAvailable(organizationId, pricedModel);

    const brand = await this.loadBrandContext(organizationId, slot.brandId);
    const scheduledItems = await this.loadScheduledCampaignItems(
      organizationId,
      slot,
      cadence,
    );
    const prompt = buildCadenceSlotGeneratePrompt({
      brandDescription: this.sanitizePromptText(
        brand?.description || brand?.text || null,
        500,
      ),
      brandLabel:
        this.sanitizePromptText(brand?.label || 'Brand', 120) ?? 'Brand',
      brandVoice: brand
        ? buildBrandVoiceSummary({
            agentConfig: (brand.agentConfig ?? {}) as BrandAgentConfig,
          })
        : null,
      campaign: {
        brief: this.sanitizePromptText(
          cadence?.brief ?? slot.resolvedBrief ?? null,
          1000,
        ),
        label: this.sanitizePromptText(cadence?.label ?? null, 120),
      },
      format: slot.format,
      instant: slot.instant,
      scheduledItems,
      slotBrief: this.sanitizePromptText(overrideBrief ?? null, 1000),
      timezone: slot.timezone,
    });

    const response = await this.llmDispatcherService.chatCompletion(
      {
        max_tokens: prompt.maxTokens,
        messages: [
          { content: prompt.system, role: 'system' },
          { content: prompt.user, role: 'user' },
        ],
        model: modelKey,
        temperature: 0.7,
      },
      organizationId,
    );
    const copy = response.choices[0]?.message?.content?.trim() ?? '';
    if (!copy) {
      throw new BadRequestException('The model returned empty copy.');
    }

    await this.settleGenerateCredits(
      organizationId,
      userId,
      pricedModel,
      { prompt: prompt.user, system: prompt.system },
      copy,
    );
    return copy;
  }

  private async loadBrandContext(
    organizationId: string,
    brandId: string,
  ): Promise<BrandContextRow | null> {
    return this.prisma.brand.findFirst({
      select: {
        agentConfig: true,
        description: true,
        label: true,
        text: true,
      },
      where: scopedWhere(organizationId, { id: brandId }),
    });
  }

  private async loadScheduledCampaignItems(
    organizationId: string,
    slot: ICalendarSlot,
    cadence: CadenceRecord | null,
  ): Promise<{ content: string; instant: string }[]> {
    const slotInstant = new Date(slot.instant);
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    const windowStart = cadence
      ? cadence.startsAt
      : new Date(slotInstant.getTime() - fourteenDays);
    const windowEnd = cadence
      ? (cadence.endsAt ??
        new Date(
          cadence.startsAt.getTime() +
            MAX_CADENCE_SPAN_DAYS * 24 * 60 * 60 * 1000,
        ))
      : new Date(slotInstant.getTime() + fourteenDays);

    const posts = (await this.prisma.post.findMany({
      select: {
        description: true,
        scheduledDate: true,
      },
      orderBy: { scheduledDate: 'asc' },
      take: 24,
      where: scopedWhere(organizationId, {
        brandId: slot.brandId,
        category: slot.format,
        credentialId: slot.credentialId,
        parentId: null,
        scheduledDate: {
          gte: windowStart,
          lte: windowEnd,
        },
      }),
    })) as ScheduledCampaignRow[];

    return posts
      .filter(
        (post): post is ScheduledCampaignRow & { scheduledDate: Date } =>
          Boolean(post.scheduledDate) && Boolean(post.description?.trim()),
      )
      .filter(
        (post) =>
          !isWithinConsumptionTolerance(
            slot.instant,
            post.scheduledDate.toISOString(),
          ),
      )
      .sort(
        (left, right) =>
          Math.abs(left.scheduledDate.getTime() - slotInstant.getTime()) -
          Math.abs(right.scheduledDate.getTime() - slotInstant.getTime()),
      )
      .slice(0, MAX_SCHEDULED_CAMPAIGN_ITEMS)
      .sort(
        (left, right) =>
          left.scheduledDate.getTime() - right.scheduledDate.getTime(),
      )
      .map((post) => ({
        content:
          this.sanitizePromptText(post.description, 280) ?? post.description,
        instant: post.scheduledDate.toISOString(),
      }));
  }

  private resolveGenerateModelKey(): string {
    return shouldUseLowestCostModelDefaults({
      isCloud: isCloudDeployment(),
    })
      ? LOWEST_COST_AGENT_CHAT_MODEL_KEY
      : DEFAULT_AGENT_CHAT_MODEL_KEY;
  }

  private async getPricedGenerateModel(
    modelKey: string,
  ): Promise<TextPricedModel> {
    const catalog = await this.modelsService.findOne({
      key: baseModelKey(modelKey),
    });
    if (catalog) {
      return catalog;
    }

    const chat = getAgentChatModel(modelKey);
    if (!chat) {
      return { cost: 1, minCost: 1 };
    }

    return {
      inputCostPerMillionTokens: Math.ceil(
        (chat.pricing.promptPerMillion * AGENT_CREDIT_MARGIN_MULTIPLIER) /
          AGENT_CREDIT_USD,
      ),
      minCost: 1,
      outputCostPerMillionTokens: Math.ceil(
        (chat.pricing.completionPerMillion * AGENT_CREDIT_MARGIN_MULTIPLIER) /
          AGENT_CREDIT_USD,
      ),
      pricingType: 'per-token',
    };
  }

  private async assertGenerateCreditsAvailable(
    organizationId: string,
    model: TextPricedModel,
  ): Promise<void> {
    const requiredCredits = getMinimumTextCredits(model);
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );
    if (hasCredits) {
      return;
    }

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );
    throw new InsufficientCreditsException(requiredCredits, currentBalance);
  }

  private async settleGenerateCredits(
    organizationId: string,
    userId: string,
    model: TextPricedModel,
    input: Record<string, unknown>,
    output: string,
  ): Promise<void> {
    const amount = calculateEstimatedTextCredits(model, input, output);
    if (amount <= 0) {
      return;
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      userId,
      amount,
      'Calendar campaign generate',
      ActivitySource.POST_GENERATION,
      {
        maxOverdraftCredits: PostingCadencesService.TEXT_MAX_OVERDRAFT_CREDITS,
      },
    );
  }

  private sanitizePromptText(
    value: string | null | undefined,
    maxLength: number,
  ): string | null {
    if (!value?.trim()) {
      return null;
    }
    return SecurityUtil.sanitizePromptInput(value, maxLength) || null;
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

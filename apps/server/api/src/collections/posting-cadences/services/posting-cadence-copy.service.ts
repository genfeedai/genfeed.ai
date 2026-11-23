import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import {
  BusinessLogicException,
  InsufficientCreditsException,
} from '@api/exceptions/business-logic.exception';
import type { ApiKeyPublishingContext } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
import {
  releaseTextCredits,
  reserveTextCredits,
  settleTextCredits,
  type TextCreditHold,
} from '@api/helpers/utils/credits/text-credit-hold.util';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { scopedWhere } from '@api/index';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import { ActivitySource, PostCategory } from '@genfeedai/contracts';
import {
  isWithinConsumptionTolerance,
  MAX_CADENCE_SPAN_DAYS,
} from '@genfeedai/contracts/api-types/contracts/cadence-expansion.contract';
import {
  buildCadenceSlotGeneratePrompt,
  MAX_SCHEDULED_CAMPAIGN_ITEMS,
} from '@genfeedai/contracts/api-types/contracts/cadence-slot-generate.contract';
import {
  AGENT_CREDIT_MARGIN_MULTIPLIER,
  AGENT_CREDIT_USD,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  getAgentChatModel,
  LOWEST_COST_AGENT_CHAT_MODEL_KEY,
  shouldUseLowestCostModelDefaults,
} from '@genfeedai/contracts/constants';
import type { ICalendarSlot } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CadenceRecord,
  ScheduledCampaignRow,
  SlotCopyRequest,
  TextPricedModel,
} from './posting-cadence.types';

const SLOT_BRAND_CONTEXT_UNAVAILABLE =
  'Calendar copy unavailable: brand context could not be loaded, so nothing was generated or charged. Try again.';

@Traced()
@Injectable()
export class PostingCadenceCopyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly harnessGenerationService: HarnessGenerationService,
    private readonly logger: LoggerService,
  ) {}

  async generateCampaignCopy(
    organizationId: string,
    userId: string,
    slot: ICalendarSlot,
    { apiKeyContext, brief: overrideBrief, cadence }: SlotCopyRequest,
  ): Promise<string> {
    // The brief is resolved first so a slot with no brand context is refused
    // before the model is priced or credits are checked.
    const harnessBrief = await this.resolveSlotHarnessBrief(
      organizationId,
      userId,
      slot,
      cadence,
      overrideBrief,
      apiKeyContext,
    );
    const modelKey = this.resolveGenerateModelKey();
    const pricedModel = await this.getPricedGenerateModel(modelKey);
    const hold = await this.holdGenerateCredits(
      organizationId,
      userId,
      pricedModel,
      slot.brandId,
    );

    try {
      return await this.generateHeldCopy({
        apiKeyContext,
        cadence,
        harnessBrief,
        hold,
        modelKey,
        organizationId,
        overrideBrief,
        pricedModel,
        slot,
        userId,
      });
    } catch (error: unknown) {
      await releaseTextCredits(this.creditsUtilsService, hold, organizationId);
      throw error;
    }
  }

  private async generateHeldCopy(params: {
    apiKeyContext?: ApiKeyPublishingContext;
    cadence: CadenceRecord | null;
    harnessBrief: string;
    hold: TextCreditHold | undefined;
    modelKey: string;
    organizationId: string;
    overrideBrief: string | undefined;
    pricedModel: TextPricedModel;
    slot: ICalendarSlot;
    userId: string;
  }): Promise<string> {
    const {
      cadence,
      harnessBrief,
      hold,
      modelKey,
      organizationId,
      overrideBrief,
      pricedModel,
      slot,
      userId,
    } = params;
    const brandLabel = await this.loadBrandLabel(organizationId, slot.brandId);
    const scheduledItems = await this.loadScheduledCampaignItems(
      organizationId,
      slot,
      cadence,
    );
    const prompt = buildCadenceSlotGeneratePrompt({
      brandLabel: this.sanitizePromptText(brandLabel, 120) ?? 'Brand',
      campaign: {
        brief: this.sanitizePromptText(
          cadence?.brief ?? slot.resolvedBrief ?? null,
          1000,
        ),
        label: this.sanitizePromptText(cadence?.label ?? null, 120),
      },
      format: slot.format,
      harnessBrief,
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
      hold,
      organizationId,
      userId,
      pricedModel,
      { prompt: prompt.user, system: prompt.system },
      copy,
      slot.brandId,
    );
    return copy;
  }

  /**
   * Slot copy is written against the composed harness brief (org directive,
   * brand voice, guardrails, criteria, examples), like posts and newsletters.
   * It is never written without it: a missing, empty or over-budget brief
   * fails the slot with a retryable 503 before any credit is checked.
   */
  private async resolveSlotHarnessBrief(
    organizationId: string,
    userId: string,
    slot: ICalendarSlot,
    cadence: CadenceRecord | null,
    overrideBrief: string | undefined,
    apiKeyContext?: ApiKeyPublishingContext,
  ): Promise<string> {
    const brief = await this.harnessGenerationService.resolveBrief({
      ...apiKeyContext,
      brandId: slot.brandId,
      contentType: slot.format === PostCategory.ARTICLE ? 'article' : 'post',
      includeContentMemory: true,
      organizationId,
      topic:
        this.sanitizePromptText(
          overrideBrief ?? cadence?.brief ?? slot.resolvedBrief ?? null,
          200,
        ) ?? undefined,
      userId,
    });
    const harnessBrief = this.harnessGenerationService
      .formatBrief(brief)
      .trim();
    if (
      !brief ||
      !harnessBrief ||
      harnessBrief.length > BRAND_CONTEXT_CHARACTER_BUDGET
    ) {
      this.logger.warn(
        `${this.constructor.name} harness brief unavailable for calendar slot copy`,
        { brandId: slot.brandId, organizationId },
      );
      throw new ServiceUnavailableException(SLOT_BRAND_CONTEXT_UNAVAILABLE);
    }
    return harnessBrief;
  }

  private async loadBrandLabel(
    organizationId: string,
    brandId: string,
  ): Promise<string> {
    const brand = await this.prisma.brand.findFirst({
      select: { label: true },
      where: scopedWhere(organizationId, { id: brandId }),
    });
    return brand?.label || 'Brand';
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

  /**
   * Holds the model's minimum credits before it runs, so concurrent slots from
   * an organization that can pay for one cannot all pass one balance read.
   */
  private async holdGenerateCredits(
    organizationId: string,
    userId: string,
    model: TextPricedModel,
    brandId?: string | null,
  ): Promise<TextCreditHold | undefined> {
    const requiredCredits = getMinimumTextCredits(model);
    if (requiredCredits <= 0) {
      return undefined;
    }

    try {
      return await reserveTextCredits(this.creditsUtilsService, {
        brandId,
        description: 'Calendar campaign generate',
        holdCredits: requiredCredits,
        organizationId,
        source: ActivitySource.POST_GENERATION,
        userId,
        workloadType: 'posting-cadence-copy',
      });
    } catch (error: unknown) {
      if (
        error instanceof BusinessLogicException &&
        error.errorCode === 'INSUFFICIENT_CREDITS'
      ) {
        throw new InsufficientCreditsException(
          requiredCredits,
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            organizationId,
          ),
        );
      }
      throw error;
    }
  }

  private async settleGenerateCredits(
    hold: TextCreditHold | undefined,
    organizationId: string,
    userId: string,
    model: TextPricedModel,
    input: Record<string, unknown>,
    output: string,
    brandId?: string | null,
  ): Promise<void> {
    if (!hold) {
      return;
    }
    await settleTextCredits(this.creditsUtilsService, hold, {
      actualCredits: calculateEstimatedTextCredits(model, input, output),
      brandId,
      description: 'Calendar campaign generate',
      organizationId,
      source: ActivitySource.POST_GENERATION,
      userId,
    });
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
}

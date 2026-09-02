import { buildBrandVoiceSummary } from '@api/collections/brands/utils/brand-context.util';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { scopedWhere } from '@api/index';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
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
import { ActivitySource } from '@genfeedai/enums';
import type { ICalendarSlot } from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  BrandContextRow,
  CadenceRecord,
  ScheduledCampaignRow,
  TextPricedModel,
} from './posting-cadence.types';

@Injectable()
export class PostingCadenceCopyService {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

  async generateCampaignCopy(
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
      brandVoice: brand ? buildBrandVoiceSummary(brand) : null,
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
        maxOverdraftCredits:
          PostingCadenceCopyService.TEXT_MAX_OVERDRAFT_CREDITS,
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
}

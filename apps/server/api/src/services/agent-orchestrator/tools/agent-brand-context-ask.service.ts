import type { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  BRAND_CONTEXT_ASKS_CONFIG_KEY,
  parseBrandContextAskRequestId,
  readBrandContextAsks,
  resolveMissingBrandContext,
  wereFieldsAskedInThread,
} from '@api/collections/brands/utils/brand-context-asks.util';
import { buildBrandContextAskCard } from '@api/services/agent-orchestrator/constants/missing-brand-context.constant';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  IBrandContextAskCard,
  IBrandContextAskRequest,
  OnboardingAnswerFieldId,
} from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';

/** How a save_onboarding_answers call is treated. */
export type OnboardingAnswersSaveMode = 'onboarding' | 'in_flow';

function isSameCard(
  request: IBrandContextAskRequest,
  card: IBrandContextAskCard,
): boolean {
  return (
    request.allowFreeText === false &&
    request.isMultiSelect === card.isMultiSelect &&
    request.maxSelections === card.maxSelections &&
    request.options.length === card.options.length &&
    request.options.every(
      (option, index) =>
        option.id === card.options[index]?.id &&
        option.label === card.options[index]?.label,
    )
  );
}

/**
 * Server side of the in-flow brand-context question (follow-up to #6650,
 * #6651, #6648): validates and records a `brand_context:<field>` card, and
 * tells the onboarding save path whether a call belongs to onboarding.
 *
 * Every read and write is scoped to the organization and skips deleted rows.
 */
@Injectable()
export class AgentBrandContextAskService {
  constructor(
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: Pick<
      BrandsService,
      'findOne' | 'updateAgentConfig'
    >,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * A threadless call (the MCP `onboard_brand` tool) and a call from an
   * onboarding thread keep the onboarding contract. Any other thread,
   * including one that cannot be found, is an in-flow save.
   */
  async resolveSaveMode(
    ctx: ToolExecutionContext,
  ): Promise<OnboardingAnswersSaveMode> {
    if (!ctx.threadId) return 'onboarding';
    const thread = await this.prisma.agentThread.findFirst({
      select: { source: true },
      where: {
        id: ctx.threadId,
        isDeleted: false,
        organizationId: ctx.organizationId,
      },
    });
    return thread?.source === 'onboarding' ? 'onboarding' : 'in_flow';
  }

  /**
   * An in-flow save may only write fields this conversation asked on a
   * brand-context card, so the agent cannot rewrite brand strategy unasked.
   */
  assertInFlowSaveAllowed(
    agentConfig: unknown,
    threadId: string | undefined,
    fields: readonly OnboardingAnswerFieldId[],
  ): void {
    if (!threadId || !wereFieldsAskedInThread(agentConfig, threadId, fields))
      throw new BadRequestException(
        'Only save brand context the user answered or skipped on a brand context card in this conversation.',
      );
  }

  /**
   * Validates a `brand_context:<field>` request_input against the cooldowns
   * and the card built from the onboarding definition, then records the ask.
   * Returns false for any other request id, which is not a brand-context ask.
   */
  async recordAsk(
    request: IBrandContextAskRequest,
    scope: { brandId?: string; organizationId: string; threadId: string },
    now: Date = new Date(),
  ): Promise<boolean> {
    const field = parseBrandContextAskRequestId(request.requestId);
    if (!field) return false;
    if (!scope.brandId)
      throw new BadRequestException(
        'Choose a brand before asking for brand context.',
      );
    const brand = await this.brandsService.findOne({
      id: scope.brandId,
      isDeleted: false,
      organizationId: scope.organizationId,
    });
    if (!brand)
      throw new ForbiddenException(
        'The brand is not available in this organization.',
      );
    const missing = resolveMissingBrandContext({
      brand,
      now,
      threadId: scope.threadId,
    });
    const isAskable = missing.fields.some((entry) => entry.field === field);
    const card = isAskable
      ? buildBrandContextAskCard(field, missing.suggestions)
      : null;
    if (!card)
      throw new BadRequestException(
        'Do not ask for this brand context now. Continue with the request without asking.',
      );
    if (!isSameCard(request, card))
      throw new BadRequestException(
        'Send the brand context card exactly as the Missing Brand Context section lists it, with allowFreeText: false.',
      );
    const updated = await this.brandsService.updateAgentConfig(
      scope.brandId,
      scope.organizationId,
      {
        [BRAND_CONTEXT_ASKS_CONFIG_KEY]: {
          ...readBrandContextAsks(brand.agentConfig),
          [field]: { askedAt: now.toISOString(), threadId: scope.threadId },
        },
      },
    );
    if (!updated)
      throw new ForbiddenException(
        'The brand is not available in this organization.',
      );
    return true;
  }
}

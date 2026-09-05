import {
  buildCampaignPreparationCacheKey,
  type CampaignTransition,
  readCampaignConfirmationSourceActionId,
  readPreparedCampaignTransition,
} from '@api/services/agent-orchestrator/tools/agent-campaign-tool-handler.service';
import { CacheService } from '@api/services/cache/cache.service';
import type { CuratedActionName } from '@genfeedai/actions';
import { type AgentToolResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';

export type PreparedAgentToolCall = {
  confirmationContext?: {
    confirmationOrigin: 'thread-ui-action';
    sourceActionId: string;
  };
  parameters: Record<string, unknown>;
};

type PrepareAgentToolCallInput = {
  currentOperatorMessage: string | null;
  organizationId: string;
  parameters: Record<string, unknown>;
  threadId: string;
  toolName: CuratedActionName;
  userId: string;
};

type ConfirmedCampaignIntent = {
  campaignId: string;
  sourceActionId: string;
};

/**
 * Owns confirmation proof at the tool boundary so the shared round runner
 * stays domain-neutral. Campaign-specific preparation and nonce redaction
 * belong here; additional confirmed tools can join without changing the loop.
 */
export class AgentToolConfirmationService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly cacheService: CacheService,
  ) {}

  async prepareToolCall(
    input: PrepareAgentToolCallInput,
  ): Promise<PreparedAgentToolCall> {
    const transition = this.readCampaignTransition(input.toolName);
    if (transition) {
      const confirmedIntent = await this.resolveConfirmedCampaignIntent(
        transition,
        input.currentOperatorMessage,
        input.organizationId,
        input.threadId,
      );
      if (confirmedIntent) {
        return {
          confirmationContext: {
            confirmationOrigin: 'thread-ui-action',
            sourceActionId: confirmedIntent.sourceActionId,
          },
          parameters: {
            campaignId: confirmedIntent.campaignId,
            confirmed: true,
            sourceActionId: confirmedIntent.sourceActionId,
          },
        };
      }
    }

    // Confirmation is a server-owned fact for every tool, not only campaign
    // transitions: `confirmed`/`sourceActionId` are model-facing parameters
    // the operator never actually approved, so they are stripped here
    // before dispatch regardless of tool. Tools that need a card decide
    // "is this confirmed" from `ctx.confirmationOrigin`, set only by the
    // trusted card-button resume path (never by this stripped-out claim).
    const hasClaimedConfirmation =
      input.parameters.confirmed === true ||
      input.parameters.sourceActionId !== undefined;
    if (hasClaimedConfirmation) {
      this.loggerService.warn('Rejected untrusted tool confirmation proof', {
        campaignId: input.parameters.campaignId,
        organizationId: input.organizationId,
        threadId: input.threadId,
        toolName: input.toolName,
        userId: input.userId,
      });
    }
    const {
      confirmed: _untrustedConfirmed,
      sourceActionId: _untrustedSourceActionId,
      ...parameters
    } = input.parameters;
    return { parameters };
  }

  buildModelVisibleResult(
    toolName: CuratedActionName,
    result: AgentToolResult,
  ): AgentToolResult {
    if (
      !this.readCampaignTransition(toolName) ||
      result.requiresConfirmation !== true
    ) {
      return result;
    }

    const safeData = Object.fromEntries(
      Object.entries(result.data ?? {}).filter(
        ([key]) => key !== 'confirmationPrompt' && key !== 'sourceActionId',
      ),
    );
    const { nextActions: _nextActions, ...safeResult } = result;
    return { ...safeResult, data: safeData };
  }

  private readCampaignTransition(
    toolName: CuratedActionName,
  ): CampaignTransition | null {
    if (toolName === 'start_outreach_sequence') {
      return 'start';
    }
    if (toolName === 'pause_outreach_sequence') {
      return 'pause';
    }
    return null;
  }

  private async resolveConfirmedCampaignIntent(
    transition: CampaignTransition,
    currentOperatorMessage: string | null,
    organizationId: string,
    threadId: string,
  ): Promise<ConfirmedCampaignIntent | null> {
    if (!currentOperatorMessage) {
      return null;
    }

    const sourceActionId = readCampaignConfirmationSourceActionId(
      currentOperatorMessage,
    );
    if (!sourceActionId) {
      return null;
    }

    const preparation = readPreparedCampaignTransition(
      await this.cacheService.get<unknown>(
        buildCampaignPreparationCacheKey({
          organizationId,
          sourceActionId,
          threadId,
        }),
      ),
    );
    if (
      preparation?.transition !== transition ||
      preparation.sourceActionId !== sourceActionId ||
      preparation.confirmationPrompt !== currentOperatorMessage
    ) {
      return null;
    }

    return { campaignId: preparation.campaignId, sourceActionId };
  }
}

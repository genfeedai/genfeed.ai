import { normalizeRequestedSkillSlugs } from '@api/collections/skills/utils/requested-skill-slugs.util';
import type {
  AgentChatRequest,
  AgentGenerationSettings,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  AgentAutonomyMode,
  AgentThreadMode,
  AgentType,
  KnowledgeSourcePurpose,
  toRouterPriority,
} from '@genfeedai/contracts';
import type { KnowledgeSelection } from '@genfeedai/contracts/interfaces';
import { parseGenerationEntry } from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import { readRecord } from '@genfeedai/utils/data/extract.util';

type AgentTurnWorkflowRequest = AgentChatRequest & {
  campaignId?: string;
  strategyId?: string;
};

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `${field} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

function projectGenerationSettings(
  value: unknown,
): AgentGenerationSettings | undefined {
  if (value === undefined) return undefined;
  const settings = readRecord(value);
  const aspectRatio = requiredString(
    settings.aspectRatio,
    'request.generationSettings.aspectRatio',
  ).trim();
  const prioritize = toRouterPriority(optionalString(settings.prioritize));
  if (settings.prioritize !== undefined && !prioritize) {
    throw new Error('request.generationSettings.prioritize is unsupported');
  }
  const duration = optionalNumber(
    settings.duration,
    'request.generationSettings.duration',
    1,
    60,
  );
  const model = optionalString(settings.model);
  const outputs = optionalNumber(
    settings.outputs,
    'request.generationSettings.outputs',
    1,
    8,
  );
  const resolution = optionalString(settings.resolution);
  return {
    aspectRatio,
    ...(duration !== undefined ? { duration } : {}),
    ...(model ? { model } : {}),
    ...(outputs !== undefined ? { outputs } : {}),
    ...(prioritize ? { prioritize } : {}),
    ...(resolution ? { resolution } : {}),
  };
}

function projectStringList(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new Error(`${path} must be a list of non-empty strings`);
  }
  return value.length > 0 ? (value as string[]) : undefined;
}

function projectKnowledgeSelection(
  value: unknown,
): KnowledgeSelection | undefined {
  if (value === undefined) return undefined;
  const selection = readRecord(value);
  const sourceIds = projectStringList(
    selection.sourceIds,
    'request.knowledgeSelection.sourceIds',
  );
  const spaceIds = projectStringList(
    selection.spaceIds,
    'request.knowledgeSelection.spaceIds',
  );
  const purposes = projectStringList(
    selection.purposes,
    'request.knowledgeSelection.purposes',
  );
  if (
    purposes?.some(
      (purpose) =>
        !Object.values(KnowledgeSourcePurpose).includes(
          purpose as KnowledgeSourcePurpose,
        ),
    )
  ) {
    throw new Error('request.knowledgeSelection.purposes is unsupported');
  }
  if (!sourceIds && !spaceIds && !purposes) return undefined;
  return {
    ...(sourceIds ? { sourceIds } : {}),
    ...(spaceIds ? { spaceIds } : {}),
    ...(purposes ? { purposes: purposes as KnowledgeSourcePurpose[] } : {}),
  };
}

export function projectAgentTurnRequest(
  value: unknown,
): AgentTurnWorkflowRequest & {
  threadId: string;
} {
  const request = readRecord(value);
  const content = requiredString(request.content, 'request.content');
  const threadId = requiredString(request.threadId, 'request.threadId');
  const source = optionalString(request.source);
  if (source && !['agent', 'onboarding', 'proactive'].includes(source)) {
    throw new Error(`Unsupported agent request source: ${source}`);
  }
  const creditBudget = request.creditBudget;
  if (
    creditBudget !== undefined &&
    (typeof creditBudget !== 'number' ||
      !Number.isFinite(creditBudget) ||
      creditBudget < 0)
  ) {
    throw new Error('request.creditBudget must be finite and nonnegative');
  }
  const autonomyMode = request.autonomyMode;
  if (
    autonomyMode !== undefined &&
    !Object.values(AgentAutonomyMode).includes(
      autonomyMode as AgentAutonomyMode,
    )
  ) {
    throw new Error('request.autonomyMode is unsupported');
  }
  const generationMode = optionalString(request.generationMode);
  if (generationMode && !['auto', 'image', 'video'].includes(generationMode)) {
    throw new Error(`Unsupported generation mode: ${generationMode}`);
  }
  const agentMode = optionalString(request.agentMode);
  if (
    agentMode &&
    !(Object.values(AgentThreadMode) as string[]).includes(agentMode)
  ) {
    throw new Error(`Unsupported agent mode: ${agentMode}`);
  }
  return {
    content,
    threadId,
    ...(creditBudget !== undefined
      ? { creditBudget: creditBudget as number }
      : {}),
    ...(autonomyMode !== undefined
      ? { autonomyMode: autonomyMode as AgentAutonomyMode }
      : {}),
    ...(optionalString(request.agentType)
      ? { agentType: optionalString(request.agentType) as AgentType }
      : {}),
    ...(Array.isArray(request.artifactReferences)
      ? { artifactReferences: request.artifactReferences }
      : {}),
    ...(Array.isArray(request.attachments)
      ? { attachments: request.attachments }
      : {}),
    ...(request.brandId === null || typeof request.brandId === 'string'
      ? { brandId: request.brandId }
      : {}),
    ...(optionalString(request.campaignId)
      ? { campaignId: optionalString(request.campaignId) }
      : {}),
    ...(optionalString(request.clientRequestId)
      ? { clientRequestId: optionalString(request.clientRequestId) }
      : {}),
    ...(typeof request.expectedContextVersion === 'number'
      ? { expectedContextVersion: request.expectedContextVersion }
      : {}),
    ...(generationMode
      ? {
          generationMode: generationMode as AgentChatRequest['generationMode'],
        }
      : {}),
    ...(parseGenerationEntry(request.generationEntry)
      ? { generationEntry: parseGenerationEntry(request.generationEntry) }
      : {}),
    ...(request.generationSettings !== undefined
      ? {
          generationSettings: projectGenerationSettings(
            request.generationSettings,
          ),
        }
      : {}),
    ...(request.requestedSkillSlugs !== undefined
      ? {
          requestedSkillSlugs: normalizeRequestedSkillSlugs(
            request.requestedSkillSlugs,
          ),
        }
      : {}),
    ...(request.knowledgeSelection !== undefined
      ? {
          knowledgeSelection: projectKnowledgeSelection(
            request.knowledgeSelection,
          ),
        }
      : {}),
    ...(optionalString(request.model)
      ? { model: optionalString(request.model) }
      : {}),
    ...(readRecord(request.pageContext) !== request.pageContext
      ? {}
      : { pageContext: readRecord(request.pageContext) }),
    ...(agentMode ? { agentMode: agentMode as AgentThreadMode } : {}),
    ...(source ? { source: source as AgentChatRequest['source'] } : {}),
    ...(optionalString(request.strategyId)
      ? { strategyId: optionalString(request.strategyId) }
      : {}),
    ...(optionalString(request.systemPromptOverride)
      ? { systemPromptOverride: optionalString(request.systemPromptOverride) }
      : {}),
    ...(optionalString(request.transferId)
      ? { transferId: optionalString(request.transferId) }
      : {}),
  };
}

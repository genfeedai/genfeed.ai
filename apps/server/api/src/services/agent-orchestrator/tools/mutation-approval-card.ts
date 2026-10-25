import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  describeCreditPricing,
  estimateToolCreditCost,
  getToolByName,
} from '@genfeedai/actions';
import type {
  AgentGenerationQuote,
  AgentMutationApprovalData,
  AgentMutationApprovalPostPreview,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import {
  readNonBlankString,
  readRecord,
} from '@genfeedai/utils/data/extract.util';

const PRIVATE_FIELD =
  /secret|password|token|authorization|credential|api.?key/i;

function describeValue(value: unknown): string {
  if (Array.isArray(value))
    return value.map(describeValue).join(', ') || 'None';
  if (value && typeof value === 'object') {
    return (
      Object.entries(value)
        .filter(([key]) => !PRIVATE_FIELD.test(key))
        .map(([key, item]) => `${humanize(key)}: ${describeValue(item)}`)
        .join('; ') || 'None'
    );
  }
  return value == null || (typeof value === 'string' && !value.trim())
    ? 'None'
    : String(value);
}

/** Parameters of `create_post` the platform preview already shows. */
const POST_PREVIEW_PARAMETERS = new Set([
  'caption',
  'content',
  'mediaUrls',
  'platform',
  'platforms',
  'targets',
]);

function readTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => readNonBlankString(item)?.trim() ?? [])
    : [];
}

/**
 * The draft per target, so the approval card can render the same platform
 * preview as the review queue instead of a key/value list.
 */
function buildPostPreviews(
  parameters: Record<string, unknown>,
): AgentMutationApprovalPostPreview[] {
  const defaultCaption =
    readNonBlankString(parameters.content)?.trim() ??
    readNonBlankString(parameters.caption)?.trim();
  const mediaUrls = readTextList(parameters.mediaUrls);
  const previews: AgentMutationApprovalPostPreview[] = [];

  for (const target of Array.isArray(parameters.targets)
    ? parameters.targets
    : []) {
    const record = readRecord(target);
    const platform = readNonBlankString(record.platform)?.trim();
    const caption =
      readNonBlankString(record.caption)?.trim() ?? defaultCaption;
    if (!platform || !caption) continue;
    previews.push({
      caption,
      credentialId: readNonBlankString(record.credentialId)?.trim(),
      mediaUrls,
      platform,
    });
  }
  if (previews.length > 0) return previews;

  const platform = readNonBlankString(parameters.platform)?.trim();
  const platforms = [
    ...new Set([
      ...readTextList(parameters.platforms),
      ...(platform ? [platform] : []),
    ]),
  ];
  return defaultCaption
    ? platforms.map((platform) => ({
        caption: defaultCaption,
        mediaUrls,
        platform,
      }))
    : [];
}

function humanize(value: string): string {
  const text = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildMutationApprovalCard(
  approvalId: string,
  toolName: string,
  parameters: Record<string, unknown>,
  context: ToolExecutionContext,
  generationQuote?: AgentGenerationQuote | null,
): AgentUiAction {
  const sourceActionId = `mutation-approval:${approvalId}`;
  const summary = humanize(toolName);
  const definition = getToolByName(toolName);
  const estimatedCredits =
    toolName === 'generate'
      ? generationQuote?.isAvailable === true &&
        typeof generationQuote.modelKey === 'string' &&
        generationQuote.modelKey.trim().length > 0 &&
        typeof generationQuote.credits === 'number' &&
        Number.isFinite(generationQuote.credits) &&
        generationQuote.credits >= 0
        ? generationQuote.credits
        : null
      : definition?.creditPricing
        ? estimateToolCreditCost(toolName, parameters, definition.creditPricing)
        : null;
  const baseDescription =
    definition?.description ?? 'Review this action before it runs.';
  const estimateSentence =
    typeof estimatedCredits === 'number'
      ? `Estimated cost: ${estimatedCredits} credits.`
      : toolName === 'generate'
        ? 'A model-specific credit quote is unavailable. Select a supported model and complete its generation settings before approving.'
        : definition?.creditPricing && definition.creditPricing.mode !== 'fixed'
          ? describeCreditPricing(definition.creditPricing)
          : undefined;
  const description =
    estimateSentence && !baseDescription.includes(estimateSentence)
      ? `${baseDescription} ${estimateSentence}`
      : baseDescription;
  const postPreviews =
    toolName === 'create_post' ? buildPostPreviews(parameters) : [];
  return {
    id: sourceActionId,
    type: 'mutation_approval_card',
    title: summary,
    description,
    requiresConfirmation: true,
    data: {
      approvalId,
      sourceActionId,
      summary,
      items: Object.entries(parameters)
        .filter(([key]) => !PRIVATE_FIELD.test(key))
        .filter(
          ([key]) =>
            postPreviews.length === 0 || !POST_PREVIEW_PARAMETERS.has(key),
        )
        .map(([key, value]) => ({
          label: humanize(key),
          value: describeValue(value),
        })),
      status: 'pending',
      scopeVersion: context.validatedScope?.contextVersion,
      brandId: context.validatedScope?.brandId ?? null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      ...(typeof estimatedCredits === 'number' ? { estimatedCredits } : {}),
      ...(postPreviews.length > 0 ? { postPreviews } : {}),
    } satisfies AgentMutationApprovalData,
    ctas: [
      {
        action: 'confirm_mutation',
        label: 'Approve',
        payload: { approvalId, sourceActionId },
      },
      {
        action: 'decline_mutation',
        label: 'Decline',
        payload: { approvalId, sourceActionId },
      },
    ],
  };
}

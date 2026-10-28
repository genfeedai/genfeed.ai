import type { GenerationBriefField } from '@api/services/agent-orchestrator/interfaces/agent-generation-brief.interface';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isExplicitAgentMediaGenerationMode } from '@genfeedai/contracts';

/**
 * What a video request settles before the agent builds it. The planner is told
 * all of it; `generate` refuses a chat-driven video that leaves out a field
 * with a `parameter`, so the agent cannot fall back to a default format or length.
 */
export const VIDEO_BRIEF_CHECKLIST: readonly GenerationBriefField[] = [
  { id: 'scene', label: 'scene or setting' },
  {
    id: 'aspectRatio',
    label: 'platform and aspect ratio',
    parameter: 'aspectRatio',
    suggestion:
      '9:16 for TikTok, Reels and Shorts; 1:1 for feeds; 16:9 for YouTube and the web',
  },
  {
    id: 'duration',
    label: 'duration',
    parameter: 'duration',
    suggestion: 'a length in seconds, such as 5, 8 or 10',
  },
  { id: 'voice', label: 'voice' },
  { id: 'music', label: 'music' },
  { id: 'callToAction', label: 'call to action' },
];

/** What an image or a post settles. Asked through the planner prompt only. */
export const IMAGE_OR_POST_BRIEF_LABELS: readonly string[] = [
  'platform',
  'format',
  'call to action',
];

/** "a, b and c" */
export function formatBriefLabels(labels: readonly string[]): string {
  if (labels.length < 2) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function isSettled(
  parameter: NonNullable<GenerationBriefField['parameter']>,
  value: unknown,
): boolean {
  if (parameter === 'aspectRatio') {
    return typeof value === 'string' && value.trim().length > 0;
  }
  const seconds = typeof value === 'string' ? Number(value) : value;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
}

/**
 * The checklist fields a chat-driven `generate` video call has not settled.
 * Empty when the person already chose: the composer's media mode or settings,
 * or a confirmed card. Empty too when nobody can answer, which is a proactive or
 * budgeted run, a call without a thread, or a host that cannot show a card.
 */
export function findUnresolvedVideoBriefFields(
  toolName: string,
  parameters: Record<string, unknown>,
  ctx: Pick<
    ToolExecutionContext,
    | 'confirmationOrigin'
    | 'creditBudget'
    | 'generationMode'
    | 'generationSettings'
    | 'hostSupportsApproval'
    | 'isProactive'
    | 'threadId'
  >,
): GenerationBriefField[] {
  if (
    toolName !== 'generate' ||
    parameters.type !== 'video' ||
    isExplicitAgentMediaGenerationMode(ctx.generationMode) ||
    ctx.generationSettings ||
    ctx.confirmationOrigin ||
    ctx.isProactive ||
    ctx.creditBudget !== undefined ||
    !ctx.threadId ||
    ctx.hostSupportsApproval !== true
  ) {
    return [];
  }
  return VIDEO_BRIEF_CHECKLIST.filter(
    (field) =>
      field.parameter !== undefined &&
      !isSettled(field.parameter, parameters[field.parameter]),
  );
}

/** The tool error that sends the agent to ask instead of defaulting. */
export function buildUnresolvedBriefMessage(
  fields: readonly GenerationBriefField[],
): string {
  const wanted = fields
    .map((field) =>
      field.suggestion ? `${field.label} (${field.suggestion})` : field.label,
    )
    .join('; ');
  return `Ask before building this video. It still needs: ${wanted}. Send one request_input card for each, with a few options and free text allowed, then stop until the person answers and call generate again with their answers. If the person already gave a value in this conversation, pass it instead of asking.`;
}

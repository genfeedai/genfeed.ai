import type {
  GenerationBriefField,
  GenerationBriefKind,
  UnresolvedGenerationBrief,
} from '@api/services/agent-orchestrator/interfaces/agent-generation-brief.interface';
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

/** What an image settles. `generate` refuses a chat-driven image without a format. */
export const IMAGE_BRIEF_CHECKLIST: readonly GenerationBriefField[] = [
  { id: 'subject', label: 'subject' },
  {
    id: 'aspectRatio',
    label: 'platform and aspect ratio',
    parameter: 'aspectRatio',
    suggestion:
      '9:16 for stories and Reels; 1:1 or 4:5 for feeds; 16:9 for YouTube and the web',
  },
  { id: 'style', label: 'style' },
  { id: 'callToAction', label: 'call to action' },
];

/** What a social post settles. `generate_content` refuses one without a platform. */
export const POST_BRIEF_CHECKLIST: readonly GenerationBriefField[] = [
  {
    id: 'platform',
    label: 'platform',
    parameter: 'platform',
    suggestion: 'instagram, linkedin, twitter, tiktok, youtube or facebook',
  },
  { id: 'angle', label: 'angle or audience' },
  { id: 'callToAction', label: 'call to action' },
];

/** The `generate_content` types that are social posts, not articles or scripts. */
const POST_CONTENT_TYPES = new Set([
  'caption',
  'post',
  'thread',
  'article_outline',
]);

const BRIEF_NOUNS: Record<GenerationBriefKind, string> = {
  image: 'image',
  post: 'post',
  video: 'video',
};

/** "a, b and c" */
export function formatBriefLabels(labels: readonly string[]): string {
  if (labels.length < 2) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function isSettled(
  parameter: NonNullable<GenerationBriefField['parameter']>,
  value: unknown,
): boolean {
  if (parameter === 'aspectRatio' || parameter === 'platform') {
    return typeof value === 'string' && value.trim().length > 0;
  }
  const seconds = typeof value === 'string' ? Number(value) : value;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
}

function resolveBriefKind(
  toolName: string,
  parameters: Record<string, unknown>,
): {
  checklist: readonly GenerationBriefField[];
  kind: GenerationBriefKind;
} | null {
  if (toolName === 'generate' && parameters.type === 'video') {
    return { checklist: VIDEO_BRIEF_CHECKLIST, kind: 'video' };
  }
  if (toolName === 'generate' && parameters.type === 'image') {
    return { checklist: IMAGE_BRIEF_CHECKLIST, kind: 'image' };
  }
  if (
    toolName === 'generate_content' &&
    typeof parameters.type === 'string' &&
    POST_CONTENT_TYPES.has(parameters.type)
  ) {
    return { checklist: POST_BRIEF_CHECKLIST, kind: 'post' };
  }
  return null;
}

/**
 * The checklist fields a chat-driven video, image or post call has not settled,
 * or null when it is settled or not gated. Not gated when the person already
 * chose (the composer's media mode or settings, or a confirmed card) or when
 * nobody can answer (a proactive or budgeted run, a call without a thread, or a
 * host that cannot show a card).
 */
export function findUnresolvedBrief(
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
): UnresolvedGenerationBrief | null {
  const brief = resolveBriefKind(toolName, parameters);
  if (
    !brief ||
    isExplicitAgentMediaGenerationMode(ctx.generationMode) ||
    ctx.generationSettings ||
    ctx.confirmationOrigin ||
    ctx.isProactive ||
    ctx.creditBudget !== undefined ||
    !ctx.threadId ||
    ctx.hostSupportsApproval !== true
  ) {
    return null;
  }
  const fields = brief.checklist.filter(
    (field) =>
      field.parameter !== undefined &&
      !isSettled(field.parameter, parameters[field.parameter]),
  );
  return fields.length > 0 ? { fields, kind: brief.kind, toolName } : null;
}

/** The tool error that sends the agent to ask instead of defaulting. */
export function buildUnresolvedBriefMessage(
  brief: UnresolvedGenerationBrief,
): string {
  const wanted = brief.fields
    .map((field) =>
      field.suggestion ? `${field.label} (${field.suggestion})` : field.label,
    )
    .join('; ');
  return `Ask before building this ${BRIEF_NOUNS[brief.kind]}. It still needs: ${wanted}. Send one request_input card for each, with a few options and free text allowed, then stop until the person answers and call ${brief.toolName} again with their answers. If the person already gave a value in this conversation, pass it instead of asking.`;
}

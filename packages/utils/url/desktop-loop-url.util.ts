import { isSourcePostVariationPlatform, Platform } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IClipDraftHandoff } from '@genfeedai/contracts/interfaces';
import type {
  TrendItem,
  TrendSourceItem,
} from '@genfeedai/props/trends/trends-page.props';

export { isSourcePostVariationPlatform };

function buildQuery(params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export function buildAgentPromptHref(prompt: string): string {
  return `${APP_ROUTES.AGENT.NEW}${buildQuery({ prompt })}`;
}

/**
 * A finished clip used to hand off to the post composer with its media
 * pre-attached. Writing now starts in the Agent, so the same context travels as
 * a prompt instead of query params on a form.
 */
export function buildClipDraftAgentHref(clip: IClipDraftHandoff): string {
  const prompt = [
    'Draft a social post for this generated clip.',
    `Title: "${clip.title}".`,
    clip.description ? `Description: "${clip.description}".` : undefined,
    clip.ingredientId ? `Ingredient id: ${clip.ingredientId}.` : undefined,
    'Write the caption, then suggest the best platform and schedule for it.',
  ]
    .filter(Boolean)
    .join(' ');

  return buildAgentPromptHref(prompt);
}

export function buildTrendAgentHref(
  trend: Pick<TrendItem, 'topic' | 'platform'>,
): string {
  return buildAgentPromptHref(
    `Help me turn the ${trend.platform} trend "${trend.topic}" into my next piece of content. Summarize the opportunity and suggest the best next step.`,
  );
}

export function buildTrendSourceAgentHref(
  trend: TrendItem,
  source: TrendSourceItem,
): string {
  const prompt = [
    `Generate a remix from this source content for my brand.`,
    `Platform: ${source.platform}.`,
    `Trend: "${trend.topic}".`,
    source.authorHandle ? `Creator: @${source.authorHandle}.` : undefined,
    source.text ? `Source text: "${source.text}".` : undefined,
    `Source URL: ${source.sourceUrl}.`,
    'Summarize the opportunity, then produce the best remix prompt or content plan.',
  ]
    .filter(Boolean)
    .join(' ');

  return buildAgentPromptHref(prompt);
}

export function buildTrendSourcePrompt(
  trend: TrendItem,
  source: TrendSourceItem,
): string {
  return [
    `Remix this ${source.platform} source into a new piece of content for my brand.`,
    `Trend: "${trend.topic}".`,
    source.authorHandle ? `Creator: @${source.authorHandle}.` : undefined,
    source.title ? `Title: "${source.title}".` : undefined,
    source.text ? `Source text: "${source.text}".` : undefined,
    `Source URL: ${source.sourceUrl}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildTrendSourceTwitterDraftHref(
  trend: TrendItem,
  source: TrendSourceItem,
  isThread: boolean = false,
): string {
  return `/publishing/remix${buildQuery({
    mode: isThread ? 'thread' : 'tweet',
    platform: Platform.TWITTER,
    sourceAuthor: source.authorHandle,
    sourceReferenceId: source.sourceReferenceId,
    sourceText: source.text || source.title,
    sourceUrl: source.sourceUrl,
    topic: trend.topic,
    trendId: trend.id,
  })}`;
}

export function buildSourcePostVariationsHref(params: {
  platform: string;
  postId?: string;
  sourcePostId?: string;
  sourceReferenceId?: string;
  trendId?: string;
}): string {
  return `${APP_ROUTES.PUBLISHING.REMIX}${buildQuery({
    platform: params.platform,
    postId: params.postId,
    sourcePostId: params.sourcePostId,
    sourceReferenceId: params.sourceReferenceId,
    trendId: params.trendId,
  })}`;
}

export function buildPostAnalyticsHref(postId: string): string {
  return `/analytics/posts${buildQuery({ postId })}`;
}

export function buildPostAgentHref(postLabel: string): string {
  return buildAgentPromptHref(
    `Review the performance and next best action for the post "${postLabel}". If it has enough signal, suggest whether I should remix it or try a new variation.`,
  );
}

export function buildStudioAgentHref(
  assetLabel: string,
  promptText?: string,
): string {
  const prompt = promptText
    ? `I am reviewing the asset "${assetLabel}". Here is the original prompt: "${promptText}". Summarize the best next step for this asset in the loop.`
    : `I am reviewing the asset "${assetLabel}". Summarize the best next step for this asset in the loop.`;

  return buildAgentPromptHref(prompt);
}

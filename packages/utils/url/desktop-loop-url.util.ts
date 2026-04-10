import { IngredientCategory } from '@genfeedai/enums';
import type {
  TrendItem,
  TrendSourceItem,
} from '@genfeedai/props/trends/trends-page.props';

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

export function resolveTrendStudioType(
  trend: Pick<TrendItem, 'metadata'>,
): IngredientCategory.IMAGE | IngredientCategory.VIDEO {
  const trendType = trend.metadata?.trendType;

  if (trendType === 'video' || trendType === 'sound') {
    return IngredientCategory.VIDEO;
  }

  return IngredientCategory.IMAGE;
}

export function buildTrendStudioHref(
  trend: Pick<TrendItem, 'topic' | 'platform' | 'metadata'>,
): string {
  const type = resolveTrendStudioType(trend);
  const promptParts = [
    `Create a ${trend.platform} concept inspired by the trend "${trend.topic}".`,
    trend.metadata?.sampleContent
      ? `Use this as inspiration: ${trend.metadata.sampleContent}`
      : undefined,
    trend.metadata?.creatorHandle
      ? `Reference creator context: ${trend.metadata.creatorHandle}.`
      : undefined,
  ];

  return `/studio/${type}${buildQuery({
    text: promptParts.filter(Boolean).join(' '),
  })}`;
}

export function buildAgentPromptHref(prompt: string): string {
  return `/chat/new${buildQuery({ prompt })}`;
}

export function buildTrendAgentHref(
  trend: Pick<TrendItem, 'topic' | 'platform'>,
): string {
  return buildAgentPromptHref(
    `Help me turn the ${trend.platform} trend "${trend.topic}" into my next piece of content. Summarize the opportunity and suggest the best next step.`,
  );
}

function buildSourcePrompt(trend: TrendItem, source: TrendSourceItem): string {
  const parts = [
    `Create a ${source.platform} remix inspired by this source content.`,
    `Trend: "${trend.topic}".`,
    source.title ? `Title: "${source.title}".` : undefined,
    source.text ? `Source text: "${source.text}".` : undefined,
    source.authorHandle ? `Creator: @${source.authorHandle}.` : undefined,
    `Source URL: ${source.sourceUrl}.`,
  ];

  return parts.filter(Boolean).join(' ');
}

export function buildTrendSourceStudioHref(
  trend: TrendItem,
  source: TrendSourceItem,
): string {
  return `/studio/video${buildQuery({
    text: buildSourcePrompt(trend, source),
  })}`;
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
  return `/posts/remix${buildQuery({
    mode: isThread ? 'thread' : 'tweet',
    platform: 'twitter',
    sourceAuthor: source.authorHandle,
    sourceReferenceId: source.sourceReferenceId,
    sourceText: source.text || source.title,
    sourceUrl: source.sourceUrl,
    topic: trend.topic,
    trendId: trend.id,
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

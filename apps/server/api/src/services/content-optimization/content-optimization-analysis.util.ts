import type { OptimizationCycleResult } from '@api/collections/content-performance/services/optimization-cycle.service';
import type {
  PerformanceContentItem,
  WeeklySummary,
} from '@api/collections/content-performance/services/performance-summary.service';
import { SecurityUtil } from '@api/helpers/utils/security/security.util';

const HOOK_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'and',
  'are',
  'but',
  'for',
  'from',
  'has',
  'have',
  'how',
  'into',
  'its',
  'new',
  'not',
  'our',
  'out',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'was',
  'were',
  'what',
  'when',
  'why',
  'will',
  'with',
  'you',
  'your',
]);

export function tokenizeHook(hook: string | undefined): string[] {
  if (!hook) {
    return [];
  }

  return hook
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length >= 3 &&
        !HOOK_STOP_WORDS.has(token) &&
        !/^\d+$/.test(token),
    );
}

export function normalizeToken(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function toIsoDate(value: Date | string, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Content optimization requires a valid ${field}`);
  }
  return date.toISOString();
}

export function deriveInsights(
  summary: WeeklySummary,
  cycle: OptimizationCycleResult,
): string[] {
  const insights: string[] = [];

  // Trend
  const { direction, percentageChange } = summary.weekOverWeekTrend;
  if (direction === 'up') {
    insights.push(
      `Engagement is trending UP ${percentageChange.toFixed(1)}% week-over-week.`,
    );
  } else if (direction === 'down') {
    insights.push(
      `Engagement is trending DOWN ${Math.abs(percentageChange).toFixed(1)}% week-over-week — action needed.`,
    );
  }

  // Best platform
  if (summary.avgEngagementByPlatform.length > 0) {
    const best = summary.avgEngagementByPlatform[0];
    insights.push(
      `${best.platform} is your best-performing platform (${best.avgEngagementRate.toFixed(2)}% avg engagement).`,
    );
  }

  // Top hooks
  if (summary.topHooks.length > 0) {
    insights.push(
      `Your top-performing hooks start with: "${summary.topHooks[0]}..."`,
    );
  }

  // Cycle stats
  if (cycle.cycleStats.totalContent > 0) {
    insights.push(
      `Analyzed ${cycle.cycleStats.totalContent} pieces of content with avg engagement ${cycle.cycleStats.avgEngagementRate.toFixed(2)}%.`,
    );
  }

  return insights;
}

export function buildOptimizationSystemPrompt(
  topPerformers: PerformanceContentItem[],
  worstPerformers: PerformanceContentItem[],
  performanceContext: string,
): string {
  const topExamples = topPerformers
    .slice(0, 3)
    .map(
      (item) =>
        `- "${formatPerformerLabel(item)}" (engagement: ${item.engagementRate.toFixed(2)}%)`,
    )
    .join('\n');

  const antiPatterns = worstPerformers.slice(0, 3).map((item) => {
    const label = formatPerformerLabel(item);
    return `- Avoid repeating underperforming angle "${label}" (${item.engagementRate.toFixed(2)}% engagement).`;
  });

  const antiPatternSection =
    antiPatterns.length > 0
      ? `\n## Historical Anti-Patterns\n${antiPatterns.join('\n')}\n`
      : '\n';

  return `You are a content optimization AI. Analyze content performance data and improve prompts.

Performance context: ${performanceContext}

Top performing content:
${topExamples || 'No data yet.'}
${antiPatternSection}
Your job: take the user's content prompt and optimize it based on what has worked historically.
Use the performance context to explain and improve the prompt.`;
}

export function formatPerformerLabel(item: PerformanceContentItem): string {
  const rawLabel = item.title || item.description || item.postId;
  return SecurityUtil.sanitizePromptInput(rawLabel, 140);
}

export function derivePipelineConfigs(
  summary: WeeklySummary,
): Array<{ suggestion: string; reason: string }> {
  const configs: Array<{ suggestion: string; reason: string }> = [];

  const bestContentType = summary.avgEngagementByContentType[0];
  if (bestContentType) {
    if (
      bestContentType.category === 'video' ||
      bestContentType.category === 'reel'
    ) {
      configs.push({
        reason: `${bestContentType.category} content averages ${bestContentType.avgEngagementRate.toFixed(2)}% engagement`,
        suggestion:
          'Prioritize T2I → I2V pipeline steps for video-first content',
      });
    } else if (bestContentType.category === 'image') {
      configs.push({
        reason: `Image content averages ${bestContentType.avgEngagementRate.toFixed(2)}% engagement`,
        suggestion:
          'Focus on high-quality T2I generation; skip I2V for most posts',
      });
    }
  }

  if (summary.weekOverWeekTrend.direction === 'down') {
    configs.push({
      reason: `Engagement is declining ${Math.abs(summary.weekOverWeekTrend.percentageChange).toFixed(0)}%`,
      suggestion:
        'Experiment with different generation models to refresh content style',
    });
  }

  return configs;
}

export function deriveAbTestSuggestions(
  summary: WeeklySummary,
  cycle: OptimizationCycleResult,
): Array<{
  variable: string;
  variantA: string;
  variantB: string;
  hypothesis: string;
}> {
  const suggestions: Array<{
    variable: string;
    variantA: string;
    variantB: string;
    hypothesis: string;
  }> = [];

  // Time-based A/B test
  if (summary.bestPostingTimes.length >= 2) {
    const [best, second] = summary.bestPostingTimes;
    suggestions.push({
      hypothesis: `Posting at ${best.hour}:00 may outperform ${second.hour}:00 by ${(((best.avgEngagementRate - second.avgEngagementRate) / second.avgEngagementRate) * 100).toFixed(0)}%`,
      variable: 'posting_time',
      variantA: `${best.hour}:00`,
      variantB: `${second.hour}:00`,
    });
  }

  // Hook-based A/B test
  if (cycle.nextBatchSuggestions.length >= 2) {
    const [a, b] = cycle.nextBatchSuggestions;
    suggestions.push({
      hypothesis:
        'Testing different hook styles to find optimal engagement pattern',
      variable: 'hook_style',
      variantA: a.suggestedHook,
      variantB: b.suggestedHook,
    });
  }

  // Content type A/B test
  if (summary.avgEngagementByContentType.length >= 2) {
    const [best, second] = summary.avgEngagementByContentType;
    suggestions.push({
      hypothesis: `${best.category} may consistently outperform ${second.category}`,
      variable: 'content_type',
      variantA: best.category,
      variantB: second.category,
    });
  }

  return suggestions;
}

export function computeConfidence(count: number, totalDays: number): number {
  if (count <= 0 || totalDays <= 0) {
    return 0;
  }

  return Math.min(0.98, Math.max(0.4, count / totalDays));
}

export function pickTopValue(
  source: Map<string, number>,
): { value: string; count: number } | null {
  let bestValue: string | null = null;
  let bestCount = 0;

  for (const [value, count] of source.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  if (!bestValue) {
    return null;
  }

  return {
    count: bestCount,
    value: bestValue,
  };
}

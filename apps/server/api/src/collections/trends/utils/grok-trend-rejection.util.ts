import type { GrokTrendData } from '@api/services/integrations/xai/dto/grok-trends.dto';

const YEAR_TOKEN_PATTERN = /\b(20\d{2})\b/;
const HISTORICAL_CONTEXT_PATTERN =
  /\b(completed|ended|highlights?\s+from|opening ceremony from|closing ceremony from|recap|throwback|archive|from\s+20\d{2})\b/i;
const CURRENT_TRIGGER_PATTERN =
  /\b(today|tonight|this week|now|currently|new|latest|ongoing|live|breaking|just announced|released|launch|current)\b/i;

function getPastYearToken(
  topic: string,
  hashtags: string[],
  currentYear: number,
): number | null {
  for (const value of [topic, ...hashtags]) {
    const match = value.match(YEAR_TOKEN_PATTERN);
    if (!match) {
      continue;
    }

    const year = Number(match[1]);
    if (year < currentYear) {
      return year;
    }
  }

  return null;
}

export function getRejectedGrokTrendReason(
  trend: GrokTrendData,
): 'historical-context' | 'past-year-token' | null {
  const currentYear = new Date().getUTCFullYear();

  if (getPastYearToken(trend.topic, trend.hashtags, currentYear)) {
    return 'past-year-token';
  }

  if (
    HISTORICAL_CONTEXT_PATTERN.test(trend.context) &&
    !CURRENT_TRIGGER_PATTERN.test(trend.context)
  ) {
    return 'historical-context';
  }

  return null;
}

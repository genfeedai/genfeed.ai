export interface DailyPublishingRequest {
  brandId: string;
  credentialIds?: string[];
  topics?: string[];
  timezone?: string;
  autoPublish?: boolean;
  minScore?: number;
  agentStrategyId?: string;
}
export interface DailySource {
  id: string;
  kind: 'winner' | 'trend' | 'topic';
  text: string;
}
export function validateDailyRequest(value: unknown): DailyPublishingRequest {
  if (!value || typeof value !== 'object')
    throw new Error('Daily publishing requires brand settings');
  const request = value as DailyPublishingRequest;
  if (typeof request.brandId !== 'string' || !request.brandId.trim())
    throw new Error('brandId is required');
  if (
    request.minScore !== undefined &&
    (!Number.isFinite(request.minScore) ||
      request.minScore < 7 ||
      request.minScore > 10)
  )
    throw new Error('minScore must be between 7 and 10');
  for (const field of ['topics', 'credentialIds'] as const) {
    const values = request[field];
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        values.some((value) => typeof value !== 'string' || !value.trim()))
    )
      throw new Error(`${field} must contain nonempty strings`);
  }
  if (
    request.autoPublish !== undefined &&
    typeof request.autoPublish !== 'boolean'
  )
    throw new Error('autoPublish must be boolean');
  new Intl.DateTimeFormat('en-US', { timeZone: request.timezone ?? 'UTC' });
  return request;
}
export function dailySlotKey(
  brandId: string,
  credentialId: string,
  timezone: string,
  now = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `daily-publishing:${brandId}:${credentialId}:${part('year')}-${part('month')}-${part('day')}`;
}
export function selectDailySource(
  sources: DailySource[],
  topics: string[],
  recentIds: string[],
  offset: number,
): DailySource {
  const candidates = [
    ...sources,
    ...topics.map((text) => ({
      id: `topic:${text}`,
      kind: 'topic' as const,
      text,
    })),
  ].filter((source) => source.text.trim() && !recentIds.includes(source.id));
  // Topics may recur after all fresh angles are exhausted; generated text still
  // receives recent content for avoidance and is checked before scheduling.
  const usable = candidates.length
    ? candidates
    : topics
        .filter((text) => text.trim())
        .map((text) => ({ id: `topic:${text}`, kind: 'topic' as const, text }));
  if (!usable.length)
    throw new Error('No usable trend, winner, or topic for this daily slot');
  return usable[offset % usable.length];
}

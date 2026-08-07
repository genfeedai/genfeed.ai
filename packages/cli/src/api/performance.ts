import { get } from './client';
import { flattenSingle, type JsonApiSingleResponse } from './json-api';

/**
 * Query parameter names mirror
 * apps/server/api/src/collections/content-performance/controllers/performance-summary.controller.ts
 * exactly (`brandId`, `topN`, `worstN`, `limit`, `startDate`, `endDate`).
 * The controller rejects a missing or malformed `brandId` with a 400.
 */

export interface PerformanceContentItem {
  postId: string;
  title: string;
  description: string;
  platform: string;
  engagementRate: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  publishDate?: string;
}

export interface PlatformEngagement {
  platform: string;
  avgEngagementRate: number;
  totalPosts: number;
}

export interface ContentTypeEngagement {
  category: string;
  avgEngagementRate: number;
  totalPosts: number;
}

export interface PostingTimeAnalysis {
  hour: number;
  avgEngagementRate: number;
  postCount: number;
}

export interface WeekOverWeekTrend {
  direction: 'up' | 'down' | 'stable';
  percentageChange: number;
  currentEngagement: number;
  previousEngagement: number;
}

export interface WeeklySummary {
  topPerformers: PerformanceContentItem[];
  worstPerformers: PerformanceContentItem[];
  avgEngagementByPlatform: PlatformEngagement[];
  avgEngagementByContentType: ContentTypeEngagement[];
  bestPostingTimes: PostingTimeAnalysis[];
  topHooks: string[];
  weekOverWeekTrend: WeekOverWeekTrend;
}

export interface PromptPerformanceItem {
  promptSnippet: string;
  avgEngagementRate: number;
  totalPosts: number;
  totalViews: number;
}

export interface DateRangeParams {
  endDate?: string;
  startDate?: string;
}

export interface WeeklySummaryParams extends DateRangeParams {
  brandId: string;
  topN?: number;
  worstN?: number;
}

export interface TopPerformersParams extends DateRangeParams {
  brandId: string;
  limit?: number;
}

export interface PromptPerformanceParams extends DateRangeParams {
  brandId: string;
}

function buildQuery(params: Record<string, number | string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }
  return query.toString();
}

export async function getWeeklySummary(params: WeeklySummaryParams): Promise<WeeklySummary> {
  const qs = buildQuery({
    brandId: params.brandId,
    endDate: params.endDate,
    startDate: params.startDate,
    topN: params.topN,
    worstN: params.worstN,
  });
  const response = await get<JsonApiSingleResponse>(`/content-performance/summary/weekly?${qs}`);
  return flattenSingle<WeeklySummary>(response);
}

/** The controller returns a plain array here — no JSON:API envelope. */
export async function getTopPerformers(
  params: TopPerformersParams
): Promise<PerformanceContentItem[]> {
  const qs = buildQuery({
    brandId: params.brandId,
    endDate: params.endDate,
    limit: params.limit,
    startDate: params.startDate,
  });
  return await get<PerformanceContentItem[]>(`/content-performance/summary/top-performers?${qs}`);
}

/** The controller returns a plain array here — no JSON:API envelope. */
export async function getPromptPerformance(
  params: PromptPerformanceParams
): Promise<PromptPerformanceItem[]> {
  const qs = buildQuery({
    brandId: params.brandId,
    endDate: params.endDate,
    startDate: params.startDate,
  });
  return await get<PromptPerformanceItem[]>(
    `/content-performance/summary/prompt-performance?${qs}`
  );
}

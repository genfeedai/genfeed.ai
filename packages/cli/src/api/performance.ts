import { get } from './client.js';
import { flattenSingle, type JsonApiSingleResponse } from './json-api.js';

export interface PerformanceItem {
  id: string;
  title?: string;
  platform?: string;
  engagementRate?: number;
  impressions?: number;
  clicks?: number;
  likes?: number;
  shares?: number;
}

export interface WeeklySummary {
  period: string;
  totalPosts: number;
  totalEngagement: number;
  averageEngagementRate: number;
  topPerformers: PerformanceItem[];
  worstPerformers: PerformanceItem[];
}

export interface TopPerformers {
  items: PerformanceItem[];
  period?: string;
}

export interface PromptPerformance {
  prompts: PromptStat[];
  period?: string;
}

export interface PromptStat {
  prompt: string;
  uses: number;
  averageEngagement: number;
  bestPerformer?: PerformanceItem;
}

export async function getWeeklySummary(params?: {
  brand?: string;
  end?: string;
  start?: string;
  top?: number;
  worst?: number;
}): Promise<WeeklySummary> {
  const query = new URLSearchParams();
  if (params?.brand) query.set('brand', params.brand);
  if (params?.top) query.set('top', String(params.top));
  if (params?.worst) query.set('worst', String(params.worst));
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  const qs = query.toString();
  const path = qs
    ? `/content-performance/summary/weekly?${qs}`
    : '/content-performance/summary/weekly';
  const response = await get<JsonApiSingleResponse>(path);
  return flattenSingle<WeeklySummary>(response);
}

export async function getTopPerformers(params?: {
  brand?: string;
  end?: string;
  limit?: number;
  start?: string;
}): Promise<TopPerformers> {
  const query = new URLSearchParams();
  if (params?.brand) query.set('brand', params.brand);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  const qs = query.toString();
  const path = qs
    ? `/content-performance/summary/top-performers?${qs}`
    : '/content-performance/summary/top-performers';
  const response = await get<JsonApiSingleResponse>(path);
  return flattenSingle<TopPerformers>(response);
}

export async function getPromptPerformance(params?: {
  brand?: string;
  end?: string;
  start?: string;
}): Promise<PromptPerformance> {
  const query = new URLSearchParams();
  if (params?.brand) query.set('brand', params.brand);
  if (params?.start) query.set('start', params.start);
  if (params?.end) query.set('end', params.end);
  const qs = query.toString();
  const path = qs
    ? `/content-performance/summary/prompt-performance?${qs}`
    : '/content-performance/summary/prompt-performance';
  const response = await get<JsonApiSingleResponse>(path);
  return flattenSingle<PromptPerformance>(response);
}

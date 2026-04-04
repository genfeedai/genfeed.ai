import { get, post } from './client.js';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api.js';

export interface Insight {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  score?: number;
  createdAt?: string;
}

export interface Forecast {
  topic: string;
  platform?: string;
  prediction?: string;
  confidence?: number;
  trendDirection?: string;
}

export interface ViralAnalysis {
  score: number;
  factors?: string[];
  suggestions?: string[];
}

export interface ContentGap {
  topic: string;
  opportunity?: string;
  competition?: string;
}

export interface PostingTime {
  day: string;
  hour: number;
  score: number;
}

export interface GrowthPrediction {
  platform: string;
  currentFollowers?: number;
  predictedGrowth?: number;
  timeframe?: string;
  suggestions?: string[];
}

export async function getInsights(limit = 5): Promise<Insight[]> {
  const response = await get<JsonApiCollectionResponse>(`/insights?limit=${limit}`);
  return flattenCollection<Insight>(response);
}

export async function getForecast(topic: string, platform?: string): Promise<Forecast> {
  const response = await post<JsonApiSingleResponse>('/insights/forecast', {
    platform,
    topic,
  });
  return flattenSingle<Forecast>(response);
}

export async function getViralAnalysis(content: string): Promise<ViralAnalysis> {
  const response = await post<JsonApiSingleResponse>('/insights/viral', { content });
  return flattenSingle<ViralAnalysis>(response);
}

export async function getContentGaps(): Promise<ContentGap[]> {
  const response = await get<JsonApiCollectionResponse>('/insights/gaps');
  return flattenCollection<ContentGap>(response);
}

export async function getPostingTimes(
  platform = 'instagram',
  timezone = 'UTC'
): Promise<PostingTime[]> {
  const response = await get<JsonApiCollectionResponse>(
    `/insights/times?platform=${platform}&timezone=${timezone}`
  );
  return flattenCollection<PostingTime>(response);
}

export async function getGrowthPrediction(platform = 'instagram'): Promise<GrowthPrediction> {
  const response = await get<JsonApiSingleResponse>(`/insights/growth?platform=${platform}`);
  return flattenSingle<GrowthPrediction>(response);
}

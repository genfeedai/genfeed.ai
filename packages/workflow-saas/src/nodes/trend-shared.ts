/**
 * Shared Types for Trend Automation Nodes
 *
 * Common types and interfaces used across trend-related workflow nodes.
 */

import type { BaseNodeData } from '@workflow-saas/types';

/**
 * Supported social platforms for trend monitoring
 */
export type TrendPlatform =
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'youtube'
  | 'reddit';

/**
 * Content type categories
 */
export type TrendType = 'video' | 'hashtag' | 'sound' | 'topic';

/**
 * Video aspect ratios
 */
export type AspectRatio = '16:9' | '9:16' | '1:1';

/**
 * How closely to match the original trend
 */
export type InspirationStyle =
  | 'match_closely'
  | 'inspired_by'
  | 'remix_concept';

/**
 * Content style categories
 */
export type ContentStyle =
  | 'cinematic'
  | 'vlog'
  | 'tutorial'
  | 'comedy'
  | 'aesthetic'
  | 'educational'
  | 'storytelling'
  | 'trend_dance'
  | 'product'
  | 'other';

/**
 * Content type output
 */
export type ContentType = 'video' | 'image' | 'carousel' | 'thread';

/**
 * Content format preference
 */
export type ContentPreference = 'video' | 'image' | 'any';

/**
 * Trend check frequency intervals
 */
export type CheckFrequency = '15min' | '30min' | '1hr' | '4hr' | 'daily';

/**
 * Audio mixing modes for sound overlay
 */
export type MixMode = 'replace' | 'mix' | 'background';

/**
 * Base interface for trend-related node data
 * Extends BaseNodeData with common trend node fields
 */
export interface BaseTrendNodeData extends BaseNodeData {
  status: 'idle' | 'pending' | 'processing' | 'complete' | 'error';
  error?: string;
}

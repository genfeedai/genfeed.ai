/**
 * Music Source Node Types
 *
 * This node resolves music from various sources for beat-synced editing.
 * Supports trending sounds, curated library, user uploads, and AI generation.
 */

import { MusicSourceType } from '@genfeedai/enums';
import type { BaseTrendNodeData } from './trend-shared';

export interface MusicSourceNodeData extends BaseTrendNodeData {
  // Configuration
  sourceType: MusicSourceType;

  // Trend sound options
  trendPlatform: 'tiktok' | 'instagram' | null;
  trendMinUsage: number;

  // Library options
  libraryCategory: string | null;
  libraryMood: string | null;

  // Upload options
  uploadUrl: string | null;

  // Generate options
  generatePrompt: string | null;
  generateDuration: number;

  // Outputs
  musicUrl: string | null;
  duration: number | null;
  tempo: number | null;
  title: string | null;

  // Additional info
  artist: string | null;
  coverUrl: string | null;
}

export const DEFAULT_MUSIC_SOURCE_DATA: Partial<MusicSourceNodeData> = {
  artist: null,
  coverUrl: null,
  duration: null,
  generateDuration: 30,
  generatePrompt: null,
  label: 'Music Source',
  libraryCategory: null,
  libraryMood: null,
  musicUrl: null,
  sourceType: MusicSourceType.LIBRARY,
  status: 'idle',
  tempo: null,
  title: null,
  trendMinUsage: 10000,
  trendPlatform: null,
  uploadUrl: null,
};

/**
 * Trend Video Inspiration Node Types
 *
 * This node extracts a generation prompt from a trending video.
 * Uses AI to analyze the video's hook, style, and format to create
 * a prompt suitable for AI video generation tools.
 */

import type {
  AspectRatio,
  BaseTrendNodeData,
  ContentStyle,
  InspirationStyle,
  TrendPlatform,
} from './trend-shared';

export interface TrendVideoInspirationNodeData extends BaseTrendNodeData {
  // Inputs (can be connected or auto-selected)
  trendId: string | null;
  auto: boolean;

  // Configuration
  platform: TrendPlatform;
  inspirationStyle: InspirationStyle;
  includeOriginalHook: boolean;
  minViralScore: number;

  // Outputs
  prompt: string | null;
  hashtags: string[];
  soundId: string | null;
  duration: number | null;
  aspectRatio: AspectRatio | null;
  style: ContentStyle | null;

  // Source video info (for display)
  sourceTrendTitle: string | null;
  sourceTrendUrl: string | null;
}

export const DEFAULT_TREND_VIDEO_INSPIRATION_DATA: Partial<TrendVideoInspirationNodeData> =
  {
    aspectRatio: null,
    auto: true,
    duration: null,
    hashtags: [],
    includeOriginalHook: false,
    inspirationStyle: 'inspired_by',
    label: 'Trend Video Inspiration',
    minViralScore: 70,
    platform: 'tiktok',
    prompt: null,
    soundId: null,
    sourceTrendTitle: null,
    sourceTrendUrl: null,
    status: 'idle',
    style: null,
    trendId: null,
  };

export const trendVideoInspirationNodeDefinition = {
  category: 'ai' as const,
  defaultData: DEFAULT_TREND_VIDEO_INSPIRATION_DATA,
  description: 'Extract generation prompt from trending video',
  icon: 'Sparkles',
  inputs: [{ id: 'trendId', label: 'Trend ID', optional: true, type: 'text' }],
  label: 'Trend Video Inspiration',
  outputs: [
    { id: 'prompt', label: 'Prompt', type: 'text' },
    { id: 'hashtags', label: 'Hashtags', type: 'text[]' },
    { id: 'soundId', label: 'Sound ID', type: 'text' },
    { id: 'duration', label: 'Duration (s)', type: 'number' },
    { id: 'aspectRatio', label: 'Aspect Ratio', type: 'text' },
    { id: 'style', label: 'Style', type: 'text' },
  ],
  type: 'trendVideoInspiration',
};

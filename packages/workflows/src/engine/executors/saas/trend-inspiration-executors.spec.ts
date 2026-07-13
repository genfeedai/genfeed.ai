import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import { DEFAULT_CREDIT_COSTS } from '../../utils/credit-calculator';
import {
  createTrendHashtagInspirationExecutor,
  type TrendHashtagInspirationOutput,
} from './trend-hashtag-inspiration-executor';
import {
  createTrendSoundInspirationExecutor,
  type TrendSoundInspirationOutput,
} from './trend-sound-inspiration-executor';
import {
  createTrendVideoInspirationExecutor,
  type TrendVideoInspirationOutput,
} from './trend-video-inspiration-executor';

const ctx: ExecutionContext = {
  organizationId: 'o',
  runId: 'r',
  userId: 'u',
  workflowId: 'w',
};

const TREND_INSPIRATION_NODE_TYPES = [
  'trendHashtagInspiration',
  'trendSoundInspiration',
  'trendVideoInspiration',
] as const;

describe('trend inspiration executors', () => {
  it('assigns explicit credits to each implemented trend inspiration node', () => {
    for (const nodeType of TREND_INSPIRATION_NODE_TYPES) {
      expect(DEFAULT_CREDIT_COSTS[nodeType]).toBe(1);
    }
  });

  it('constructs an executor for each implemented trend inspiration node', () => {
    expect(createTrendHashtagInspirationExecutor()).toBeDefined();
    expect(createTrendSoundInspirationExecutor()).toBeDefined();
    expect(createTrendVideoInspirationExecutor()).toBeDefined();
  });

  describe('TrendHashtagInspirationExecutor', () => {
    it('validates platform, content preference, and hashtag config', () => {
      const executor = createTrendHashtagInspirationExecutor();
      expect(
        executor.validate({
          config: { contentPreference: 'video', platform: 'tiktok' },
          id: 'n1',
          inputs: [],
          label: 'Trend Hashtag Inspiration',
          type: 'trendHashtagInspiration',
        }).valid,
      ).toBe(true);
      expect(
        executor.validate({
          config: { contentPreference: 'podcast', platform: 'tiktok' },
          id: 'n1',
          inputs: [],
          label: 'Trend Hashtag Inspiration',
          type: 'trendHashtagInspiration',
        }).valid,
      ).toBe(false);
    });

    it('generates a deterministic prompt from manual hashtag input', async () => {
      const result = await createTrendHashtagInspirationExecutor().execute({
        context: ctx,
        inputs: new Map<string, unknown>([['hashtag', '#CreatorTips']]),
        node: {
          config: { contentPreference: 'any', platform: 'twitter' },
          id: 'n1',
          inputs: [],
          label: 'Trend Hashtag Inspiration',
          type: 'trendHashtagInspiration',
        },
      });

      const data = result.data as TrendHashtagInspirationOutput;
      expect(data.sourceHashtag).toBe('#CreatorTips');
      expect(data.contentType).toBe('thread');
      expect(data.prompt).toContain('#CreatorTips');
      expect(data.hashtags).toContain('#CreatorTips');
      expect(result.metadata?.resolvedFromSource).toBe(false);
    });

    it('reports resolvedFromSource=false and uses the fallback when the resolver returns null', async () => {
      const resolver = vi.fn().mockResolvedValue(null);

      const result = await createTrendHashtagInspirationExecutor(
        resolver,
      ).execute({
        context: ctx,
        inputs: new Map<string, unknown>([['hashtag', '#CreatorTips']]),
        node: {
          config: { platform: 'tiktok' },
          id: 'n1',
          inputs: [],
          label: 'Trend Hashtag Inspiration',
          type: 'trendHashtagInspiration',
        },
      });

      const data = result.data as TrendHashtagInspirationOutput;
      expect(resolver).toHaveBeenCalledTimes(1);
      // Wired resolver returned null -> synthesized fallback, not a real source.
      expect(result.metadata?.resolvedFromSource).toBe(false);
      expect(data.sourceHashtag).toBe('#CreatorTips');
      expect(data.hashtagPostCount).toBeNull();
    });

    it('uses resolver data when available', async () => {
      const resolver = vi.fn().mockResolvedValue({
        hashtag: 'AIWorkflow',
        platform: 'tiktok',
        postCount: 100000,
        relatedHashtags: ['automation'],
      });

      const result = await createTrendHashtagInspirationExecutor(
        resolver,
      ).execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { platform: 'tiktok' },
          id: 'n1',
          inputs: [],
          label: 'Trend Hashtag Inspiration',
          type: 'trendHashtagInspiration',
        },
      });

      const data = result.data as TrendHashtagInspirationOutput;
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'o', platform: 'tiktok' }),
      );
      expect(data.sourceHashtag).toBe('#AIWorkflow');
      expect(data.hashtagPostCount).toBe(100000);
      expect(data.hashtags).toContain('#automation');
      expect(result.metadata?.resolvedFromSource).toBe(true);
    });
  });

  describe('TrendSoundInspirationExecutor', () => {
    it('validates usage and duration config', () => {
      const executor = createTrendSoundInspirationExecutor();
      expect(
        executor.validate({
          config: { maxDuration: 30, minUsageCount: 10000 },
          id: 'n1',
          inputs: [],
          label: 'Trend Sound Inspiration',
          type: 'trendSoundInspiration',
        }).valid,
      ).toBe(true);
      expect(
        executor.validate({
          config: { maxDuration: -1 },
          id: 'n1',
          inputs: [],
          label: 'Trend Sound Inspiration',
          type: 'trendSoundInspiration',
        }).valid,
      ).toBe(false);
    });

    it('completes without a resolver and returns an explicit empty result', async () => {
      const result = await createTrendSoundInspirationExecutor().execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: {},
          id: 'n1',
          inputs: [],
          label: 'Trend Sound Inspiration',
          type: 'trendSoundInspiration',
        },
      });

      const data = result.data as TrendSoundInspirationOutput;
      expect(data.soundId).toBeNull();
      expect(result.metadata?.resolvedFromSource).toBe(false);
    });

    it('returns resolver sound metadata', async () => {
      const resolver = vi.fn().mockResolvedValue({
        authorName: 'Creator',
        coverUrl: 'https://example.com/cover.jpg',
        duration: 18,
        growthRate: 24,
        soundId: 'sound-1',
        soundName: 'Trending Loop',
        soundUrl: 'https://example.com/sound.mp3',
        usageCount: 250000,
      });

      const result = await createTrendSoundInspirationExecutor(
        resolver,
      ).execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: { maxDuration: 20, minUsageCount: 10000 },
          id: 'n1',
          inputs: [],
          label: 'Trend Sound Inspiration',
          type: 'trendSoundInspiration',
        },
      });

      const data = result.data as TrendSoundInspirationOutput;
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ maxDuration: 20, minUsageCount: 10000 }),
      );
      expect(data.soundId).toBe('sound-1');
      expect(data.soundName).toBe('Trending Loop');
    });
  });

  describe('TrendVideoInspirationExecutor', () => {
    it('validates platform, style, and viral score config', () => {
      const executor = createTrendVideoInspirationExecutor();
      expect(
        executor.validate({
          config: {
            inspirationStyle: 'remix_concept',
            minViralScore: 80,
            platform: 'instagram',
          },
          id: 'n1',
          inputs: [],
          label: 'Trend Video Inspiration',
          type: 'trendVideoInspiration',
        }).valid,
      ).toBe(true);
      expect(
        executor.validate({
          config: { minViralScore: 200 },
          id: 'n1',
          inputs: [],
          label: 'Trend Video Inspiration',
          type: 'trendVideoInspiration',
        }).valid,
      ).toBe(false);
    });

    it('generates a prompt without a resolver', async () => {
      const result = await createTrendVideoInspirationExecutor().execute({
        context: ctx,
        inputs: new Map<string, unknown>([['trendId', 'trend-1']]),
        node: {
          config: { inspirationStyle: 'inspired_by', platform: 'tiktok' },
          id: 'n1',
          inputs: [],
          label: 'Trend Video Inspiration',
          type: 'trendVideoInspiration',
        },
      });

      const data = result.data as TrendVideoInspirationOutput;
      expect(data.prompt).toContain('tiktok trend');
      expect(data.aspectRatio).toBe('9:16');
      expect(result.metadata?.trendId).toBe('trend-1');
    });

    it('uses resolver video context when available', async () => {
      const resolver = vi.fn().mockResolvedValue({
        description: 'A founder documents a launch sprint',
        duration: 12,
        hashtags: ['startup', 'buildinpublic'],
        hook: 'I built this in 24 hours',
        platform: 'youtube',
        soundId: 'sound-2',
        title: '24 hour product launch',
        trendId: 'trend-2',
        videoUrl: 'https://example.com/video',
      });

      const result = await createTrendVideoInspirationExecutor(
        resolver,
      ).execute({
        context: ctx,
        inputs: new Map(),
        node: {
          config: {
            includeOriginalHook: true,
            inspirationStyle: 'match_closely',
            minViralScore: 70,
            platform: 'youtube',
          },
          id: 'n1',
          inputs: [],
          label: 'Trend Video Inspiration',
          type: 'trendVideoInspiration',
        },
      });

      const data = result.data as TrendVideoInspirationOutput;
      expect(resolver).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'youtube', trendId: null }),
      );
      expect(data.sourceTrendTitle).toBe('24 hour product launch');
      expect(data.sourceTrendUrl).toBe('https://example.com/video');
      expect(data.prompt).toContain('I built this in 24 hours');
      expect(data.hashtags).toContain('#startup');
    });
  });
});

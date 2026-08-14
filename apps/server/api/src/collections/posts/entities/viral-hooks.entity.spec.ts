import {
  ViralHookAnalysisEntity,
  ViralHookEntity,
  ViralHookPlatformMetricsEntity,
  ViralHookSummaryEntity,
  ViralHookVideoEntity,
} from '@api/collections/posts/entities/viral-hooks.entity';
import { describe, expect, it } from 'vitest';

describe('ViralHookEntity', () => {
  it('defaults unset fields and accepts a partial payload', () => {
    expect(new ViralHookEntity()).toEqual({
      description: '',
      duration: 0,
      effectiveness: 0,
      timestamp: 0,
      type: 'visual',
    });
    expect(
      new ViralHookEntity({
        description: 'cold open',
        duration: 3,
        effectiveness: 0.8,
        timestamp: 1.5,
        type: 'verbal',
      }),
    ).toMatchObject({
      description: 'cold open',
      type: 'verbal',
    });
  });
});

describe('ViralHookPlatformMetricsEntity', () => {
  it('defaults to an unknown platform and zeroed metrics', () => {
    const metrics = new ViralHookPlatformMetricsEntity();
    expect(metrics.platform).toBe('unknown');
    expect(metrics.views).toBe(0);
    expect(metrics.viralScore).toBe(0);

    expect(
      new ViralHookPlatformMetricsEntity({
        platform: 'tiktok',
        views: 1000,
        viralScore: 72,
      } as Partial<ViralHookPlatformMetricsEntity>),
    ).toMatchObject({ platform: 'tiktok', views: 1000, viralScore: 72 });
  });
});

describe('ViralHookVideoEntity', () => {
  it('hydrates nested hooks and platform metrics', () => {
    const video = new ViralHookVideoEntity({
      creator: 'ada',
      hooks: [
        { description: 'hook', type: 'narrative' } as Partial<ViralHookEntity>,
      ],
      id: 'v1',
      platforms: [
        { platform: 'x', views: 12 } as Partial<ViralHookPlatformMetricsEntity>,
      ],
      title: 'Launch',
    });

    expect(video.title).toBe('Launch');
    expect(video.hooks[0]).toBeInstanceOf(ViralHookEntity);
    expect(video.platforms[0]).toBeInstanceOf(ViralHookPlatformMetricsEntity);
    expect(video.hooks[0]?.type).toBe('narrative');
    expect(new ViralHookVideoEntity().title).toBe('Untitled Video');
    expect(new ViralHookVideoEntity().creator).toBe('Unknown Creator');
  });
});

describe('ViralHookAnalysisEntity', () => {
  it('seeds empty hook-effectiveness buckets when none are provided', () => {
    const analysis = new ViralHookAnalysisEntity();
    expect(analysis.hookEffectiveness.map((item) => item.type)).toEqual([
      'visual',
      'verbal',
      'narrative',
      'structural',
    ]);
    expect(
      new ViralHookAnalysisEntity({
        hookEffectiveness: [{ avgEffectiveness: 1, count: 2, type: 'visual' }],
        topHooks: ['cold open'],
        totalVideos: 3,
      } as Partial<ViralHookAnalysisEntity>),
    ).toMatchObject({
      topHooks: ['cold open'],
      totalVideos: 3,
    });
  });
});

describe('ViralHookSummaryEntity', () => {
  it('wraps videos and analysis in entity instances', () => {
    const summary = new ViralHookSummaryEntity({
      analysis: { totalVideos: 1 } as Partial<ViralHookAnalysisEntity>,
      videos: [{ id: 'v1', title: 'One' } as Partial<ViralHookVideoEntity>],
    });

    expect(summary.videos[0]).toBeInstanceOf(ViralHookVideoEntity);
    expect(summary.analysis).toBeInstanceOf(ViralHookAnalysisEntity);
    expect(summary.analysis.totalVideos).toBe(1);
    expect(new ViralHookSummaryEntity().videos).toEqual([]);
  });
});

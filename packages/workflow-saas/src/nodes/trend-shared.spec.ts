import { describe, expect, it } from 'vitest';
import type {
  AspectRatio,
  BaseTrendNodeData,
  CheckFrequency,
  ContentPreference,
  ContentStyle,
  ContentType,
  InspirationStyle,
  MixMode,
  TrendPlatform,
  TrendType,
} from './trend-shared';

describe('trend-shared types', () => {
  it('should allow valid TrendPlatform values', () => {
    const platforms: TrendPlatform[] = [
      'tiktok',
      'instagram',
      'twitter',
      'youtube',
      'reddit',
    ];
    expect(platforms).toHaveLength(5);
  });

  it('should allow valid TrendType values', () => {
    const types: TrendType[] = ['video', 'hashtag', 'sound', 'topic'];
    expect(types).toHaveLength(4);
  });

  it('should allow valid AspectRatio values', () => {
    const ratios: AspectRatio[] = ['16:9', '9:16', '1:1'];
    expect(ratios).toHaveLength(3);
  });

  it('should allow valid InspirationStyle values', () => {
    const styles: InspirationStyle[] = [
      'match_closely',
      'inspired_by',
      'remix_concept',
    ];
    expect(styles).toHaveLength(3);
  });

  it('should allow valid ContentStyle values', () => {
    const styles: ContentStyle[] = [
      'cinematic',
      'vlog',
      'tutorial',
      'comedy',
      'aesthetic',
      'educational',
      'storytelling',
      'trend_dance',
      'product',
      'other',
    ];
    expect(styles).toHaveLength(10);
  });

  it('should allow valid ContentType values', () => {
    const types: ContentType[] = ['video', 'image', 'carousel', 'thread'];
    expect(types).toHaveLength(4);
  });

  it('should allow valid ContentPreference values', () => {
    const prefs: ContentPreference[] = ['video', 'image', 'any'];
    expect(prefs).toHaveLength(3);
  });

  it('should allow valid CheckFrequency values', () => {
    const freqs: CheckFrequency[] = ['15min', '30min', '1hr', '4hr', 'daily'];
    expect(freqs).toHaveLength(5);
  });

  it('should allow valid MixMode values', () => {
    const modes: MixMode[] = ['replace', 'mix', 'background'];
    expect(modes).toHaveLength(3);
  });

  it('should allow BaseTrendNodeData with required fields', () => {
    const data: BaseTrendNodeData = {
      label: 'Test',
      status: 'idle',
    };
    expect(data.status).toBe('idle');
    expect(data.label).toBe('Test');
  });

  it('should allow BaseTrendNodeData with optional error', () => {
    const data: BaseTrendNodeData = {
      error: 'something went wrong',
      label: 'Test',
      status: 'error',
    };
    expect(data.error).toBe('something went wrong');
  });
});

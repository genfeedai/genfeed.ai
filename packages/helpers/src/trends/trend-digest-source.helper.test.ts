import { describe, expect, it } from 'vitest';

import {
  buildTrendDigestItems,
  type RawTrendHashtag,
  type RawTrendSound,
  type RawTrendVideo,
} from './trend-digest-source.helper';

const video: RawTrendVideo = {
  platform: 'tiktok',
  title: 'Cat does a backflip',
  videoUrl: 'https://tiktok.com/@a/video/1',
  viewCount: 1_500_000,
  viralScore: 92,
};

const hashtag: RawTrendHashtag = {
  hashtag: 'trendingnow',
  platform: 'instagram',
  postCount: 23_400,
  viralityScore: 81,
};

const sound: RawTrendSound = {
  playUrl: 'https://tiktok.com/music/1',
  soundName: 'Catchy hook',
  usageCount: 14,
  viralityScore: 88,
};

describe('buildTrendDigestItems', () => {
  it('maps the stored document fields the ingest actually writes', () => {
    const [item] = buildTrendDigestItems(
      { hashtags: [], sounds: [], videos: [video] },
      { minViralScore: 70 },
    );

    expect(item).toEqual({
      platform: 'tiktok',
      topic: 'Cat does a backflip',
      type: 'video',
      url: 'https://tiktok.com/@a/video/1',
      usageCount: 1_500_000,
      viralScore: 92,
    });
  });

  it('drops entries with no usable topic instead of emitting a placeholder', () => {
    const items = buildTrendDigestItems(
      {
        hashtags: [{ ...hashtag, hashtag: undefined }],
        sounds: [{ ...sound, soundName: undefined }],
        videos: [{ ...video, description: undefined, title: undefined }],
      },
      { minViralScore: 70 },
    );

    expect(items).toEqual([]);
  });

  it('falls back to the video description when there is no title', () => {
    const [item] = buildTrendDigestItems(
      {
        hashtags: [],
        sounds: [],
        videos: [{ ...video, description: 'A caption', title: undefined }],
      },
      { minViralScore: 70 },
    );

    expect(item?.topic).toBe('A caption');
  });

  it('keeps sounds that clear the score gate', () => {
    const items = buildTrendDigestItems(
      { hashtags: [], sounds: [sound], videos: [] },
      { minViralScore: 70 },
    );

    expect(items).toEqual([
      {
        platform: 'tiktok',
        topic: 'Catchy hook',
        type: 'sound',
        url: 'https://tiktok.com/music/1',
        usageCount: 14,
        viralScore: 88,
      },
    ]);
  });

  it('applies one score gate across every trend type', () => {
    const items = buildTrendDigestItems(
      {
        hashtags: [{ ...hashtag, viralityScore: 40 }],
        sounds: [{ ...sound, viralityScore: 40 }],
        videos: [{ ...video, viralScore: 40 }],
      },
      { minViralScore: 70 },
    );

    expect(items).toEqual([]);
  });

  it('never invents a score for an unscored entry', () => {
    const items = buildTrendDigestItems(
      {
        hashtags: [],
        sounds: [{ ...sound, viralityScore: undefined }],
        videos: [],
      },
      { minViralScore: 70 },
    );

    expect(items).toEqual([]);
  });

  it('drops unscored entries even when the threshold is zero', () => {
    const items = buildTrendDigestItems(
      {
        hashtags: [{ ...hashtag, viralityScore: undefined }],
        sounds: [{ ...sound, viralityScore: undefined }],
        videos: [{ ...video, viralScore: undefined }],
      },
      { minViralScore: 0 },
    );

    expect(items).toEqual([]);
  });

  it('keeps a genuinely zero-scored entry when the threshold is zero', () => {
    const items = buildTrendDigestItems(
      { hashtags: [], sounds: [], videos: [{ ...video, viralScore: 0 }] },
      { minViralScore: 0 },
    );

    expect(items.map((item) => item.viralScore)).toEqual([0]);
  });

  it('rejects non-viral trends and strictly ranks calibrated scores', () => {
    const items = buildTrendDigestItems(
      {
        hashtags: [{ ...hashtag, viralityScore: 82 }],
        sounds: [{ ...sound, viralityScore: 68 }],
        videos: [
          { ...video, title: 'Strong', viralScore: 70 },
          { ...video, title: 'Breakout', viralScore: 83 },
          { ...video, title: 'Weak', viralScore: 46 },
        ],
      },
      { minViralScore: 70 },
    );

    expect(items.map((item) => item.viralScore)).toEqual([83, 82, 70]);
    expect(items.map((item) => item.topic)).toEqual([
      'Breakout',
      '#trendingnow',
      'Strong',
    ]);
  });

  it('honours the limit after ranking', () => {
    const items = buildTrendDigestItems(
      {
        hashtags: [hashtag],
        sounds: [sound],
        videos: [video],
      },
      { limit: 2, minViralScore: 70 },
    );

    expect(items.map((item) => item.viralScore)).toEqual([92, 88]);
  });

  it('restricts to the requested platforms when given', () => {
    const items = buildTrendDigestItems(
      { hashtags: [hashtag], sounds: [], videos: [video] },
      { minViralScore: 70, platforms: ['tiktok'] },
    );

    expect(items.map((item) => item.platform)).toEqual(['tiktok']);
  });
});

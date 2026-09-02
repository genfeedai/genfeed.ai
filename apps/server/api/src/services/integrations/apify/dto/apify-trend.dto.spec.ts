import 'reflect-metadata';

import {
  GetTrendingHashtagsDto,
  GetTrendingSoundsDto,
  GetTrendsDto,
  GetViralVideosDto,
  TrendingHashtagResponseDto,
  TrendingSoundResponseDto,
  TrendResponseDto,
  ViralVideoResponseDto,
} from '@api/services/integrations/apify/dto/apify-trend.dto';
import { Platform, Timeframe } from '@genfeedai/enums';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('Apify trend query DTOs', () => {
  it('coerces numeric limits and accepts known timeframes', async () => {
    const trends = plainToInstance(GetTrendsDto, {
      limit: '20',
      region: 'US',
      timeframe: Timeframe.H24,
    });
    expect(trends.limit).toBe(20);
    await expect(validate(trends)).resolves.toEqual([]);

    const videos = plainToInstance(GetViralVideosDto, {
      limit: '10',
      platform: Platform.TIKTOK,
      timeframe: Timeframe.D7,
    });
    expect(videos.limit).toBe(10);
    await expect(validate(videos)).resolves.toEqual([]);
  });

  it('rejects out-of-range limits', async () => {
    const hashtags = plainToInstance(GetTrendingHashtagsDto, { limit: 0 });
    const sounds = plainToInstance(GetTrendingSoundsDto, { limit: 101 });

    expect(await validate(hashtags)).not.toEqual([]);
    expect(await validate(sounds)).not.toEqual([]);
  });
});

describe('Apify trend response DTOs', () => {
  it('constructs response shapes used by the integration', () => {
    const trend = Object.assign(new TrendResponseDto(), {
      growthRate: 12,
      mentions: 40,
      metadata: {},
      platform: 'x',
      topic: 'genfeed',
      viralityScore: 80,
    });
    const video = Object.assign(new ViralVideoResponseDto(), {
      commentCount: 1,
      creatorHandle: 'ada',
      engagementRate: 4,
      externalId: 'v1',
      likeCount: 2,
      platform: 'tiktok',
      shareCount: 0,
      velocity: 9,
      viewCount: 100,
      viralScore: 70,
    });
    const hashtag = Object.assign(new TrendingHashtagResponseDto(), {
      growthRate: 3,
      hashtag: 'launch',
      platform: 'tiktok',
      postCount: 8,
      relatedHashtags: ['ai'],
      viewCount: 20,
      viralityScore: 50,
    });
    const sound = Object.assign(new TrendingSoundResponseDto(), {
      growthRate: 2,
      platform: 'tiktok',
      soundId: 's1',
      soundName: 'sting',
      usageCount: 6,
      viralityScore: 40,
    });

    expect(trend.topic).toBe('genfeed');
    expect(video.externalId).toBe('v1');
    expect(hashtag.hashtag).toBe('launch');
    expect(sound.soundId).toBe('s1');
  });
});

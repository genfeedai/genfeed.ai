import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_BRAND_ASSET_DATA,
  DEFAULT_BRAND_CONTEXT_DATA,
  DEFAULT_BRAND_DATA,
  DEFAULT_COMMENT_TRIGGER_DATA,
  DEFAULT_ENGAGEMENT_TRIGGER_DATA,
  DEFAULT_HOOK_GENERATOR_DATA,
  DEFAULT_KEYWORD_TRIGGER_DATA,
  DEFAULT_MUSIC_SOURCE_DATA,
  DEFAULT_PUBLISH_DATA,
  DEFAULT_SOUND_OVERLAY_DATA,
  DEFAULT_TREND_HASHTAG_INSPIRATION_DATA,
  DEFAULT_TREND_SOUND_INSPIRATION_DATA,
  DEFAULT_TREND_TRIGGER_DATA,
  DEFAULT_TREND_VIDEO_INSPIRATION_DATA,
} from '.';

type NodeDefaultData = {
  label?: unknown;
};

const allDefaults: Record<string, NodeDefaultData> = {
  brand: DEFAULT_BRAND_DATA,
  brandAsset: DEFAULT_BRAND_ASSET_DATA,
  brandContext: DEFAULT_BRAND_CONTEXT_DATA,
  commentTrigger: DEFAULT_COMMENT_TRIGGER_DATA,
  engagementTrigger: DEFAULT_ENGAGEMENT_TRIGGER_DATA,
  hookGenerator: DEFAULT_HOOK_GENERATOR_DATA,
  keywordTrigger: DEFAULT_KEYWORD_TRIGGER_DATA,
  musicSource: DEFAULT_MUSIC_SOURCE_DATA,
  publish: DEFAULT_PUBLISH_DATA,
  soundOverlay: DEFAULT_SOUND_OVERLAY_DATA,
  trendHashtagInspiration: DEFAULT_TREND_HASHTAG_INSPIRATION_DATA,
  trendSoundInspiration: DEFAULT_TREND_SOUND_INSPIRATION_DATA,
  trendTrigger: DEFAULT_TREND_TRIGGER_DATA,
  trendVideoInspiration: DEFAULT_TREND_VIDEO_INSPIRATION_DATA,
};

describe('node default data', () => {
  for (const [name, data] of Object.entries(allDefaults)) {
    describe(name, () => {
      it('is defined and has label', () => {
        expect(data).toBeDefined();
        expect(data.label).toBeTruthy();
      });
    });
  }
});

import { RouterPriority } from '@genfeedai/contracts';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { describe, expect, it } from 'vitest';
import {
  getDefaultStudioGenerateState,
  sanitizeStudioGenerateSettings,
  sanitizeStudioGenerateState,
} from './studio-generate-storage';

describe('getDefaultStudioGenerateState', () => {
  it('seeds every type with brand enrichment on and auto routing', () => {
    const state = getDefaultStudioGenerateState();

    expect(state.type).toBe('image');
    expect(Object.keys(state.settingsByType).toSorted()).toEqual([
      'avatar',
      'image',
      'music',
      'video',
      'voice',
    ]);

    for (const settings of Object.values(state.settingsByType)) {
      expect(settings.brandingMode).toBe('brand');
      expect(settings.modelKey).toBe(AUTO_MODEL_OPTION_VALUE);
      expect(settings.prioritize).toBe(RouterPriority.BALANCED);
    }
  });
});

describe('sanitizeStudioGenerateSettings', () => {
  it('falls back to defaults for a non-object payload', () => {
    expect(sanitizeStudioGenerateSettings('image', null).aspectRatio).toBe(
      '1:1',
    );
    expect(sanitizeStudioGenerateSettings('image', 'nope').outputs).toBe(1);
  });

  it('keeps values that are still on the current option ladder', () => {
    const settings = sanitizeStudioGenerateSettings('image', {
      aspectRatio: '16:9',
      outputs: 4,
      resolution: '2K',
    });

    expect(settings.aspectRatio).toBe('16:9');
    expect(settings.outputs).toBe(4);
    expect(settings.resolution).toBe('2K');
  });

  it('drops a persisted value the current ladder no longer offers', () => {
    const settings = sanitizeStudioGenerateSettings('image', {
      aspectRatio: '32:9',
      resolution: '8K',
    });

    expect(settings.aspectRatio).toBe('1:1');
    expect(settings.resolution).toBe('1K');
  });

  it('clamps an out-of-range outputs count back to the default', () => {
    expect(
      sanitizeStudioGenerateSettings('image', { outputs: 99 }).outputs,
    ).toBe(1);
    expect(
      sanitizeStudioGenerateSettings('image', { outputs: 0 }).outputs,
    ).toBe(1);
    expect(
      sanitizeStudioGenerateSettings('image', { outputs: 2.5 }).outputs,
    ).toBe(1);
  });

  it('restores a persisted video duration but rejects an unsupported one', () => {
    expect(
      sanitizeStudioGenerateSettings('video', { duration: 8 }).duration,
    ).toBe(8);
    expect(
      sanitizeStudioGenerateSettings('video', { duration: 42 }).duration,
    ).toBe(5);
  });

  it('validates a persisted video resolution against its selected model', () => {
    expect(
      sanitizeStudioGenerateSettings('video', {
        modelKey: 'kwaivgi/kling-v3-omni-video',
        resolution: '4k',
      }).resolution,
    ).toBe('4k');
    expect(
      sanitizeStudioGenerateSettings('video', {
        modelKey: 'google/veo-3.1',
        resolution: '4k',
      }).resolution,
    ).toBe('720p');
  });

  it('never restores speech copy from a previous session', () => {
    expect(
      sanitizeStudioGenerateSettings('voice', { speech: 'old script' }).speech,
    ).toBeUndefined();
  });

  it('keeps branding on unless it was explicitly turned off', () => {
    expect(
      sanitizeStudioGenerateSettings('image', { brandingMode: 'off' })
        .brandingMode,
    ).toBe('off');
    expect(
      sanitizeStudioGenerateSettings('image', { brandingMode: 'nonsense' })
        .brandingMode,
    ).toBe('brand');
    expect(sanitizeStudioGenerateSettings('image', {}).brandingMode).toBe(
      'brand',
    );
  });

  it('restores a persisted router priority and rejects an unknown one', () => {
    expect(
      sanitizeStudioGenerateSettings('image', {
        prioritize: RouterPriority.QUALITY,
      }).prioritize,
    ).toBe(RouterPriority.QUALITY);
    expect(
      sanitizeStudioGenerateSettings('image', { prioritize: 'fastest' })
        .prioritize,
    ).toBe(RouterPriority.BALANCED);
  });

  it('restores the chosen portrait url for avatar', () => {
    expect(
      sanitizeStudioGenerateSettings('avatar', {
        avatarPhotoUrl: 'https://cdn.genfeed.test/portrait.png',
      }).avatarPhotoUrl,
    ).toBe('https://cdn.genfeed.test/portrait.png');
  });

  it('keeps Look elements and drops blank ones', () => {
    const settings = sanitizeStudioGenerateSettings('image', {
      lighting: '   ',
      mood: 'confident',
      style: 'editorial',
    });

    expect(settings.mood).toBe('confident');
    expect(settings.style).toBe('editorial');
    expect(settings.lighting).toBeUndefined();
  });

  it('rejects non-string entries inside tag and blacklist arrays', () => {
    const settings = sanitizeStudioGenerateSettings('image', {
      blacklist: 'not-an-array',
      tags: ['launch', 7, null, 'q4'],
    });

    expect(settings.tags).toEqual(['launch', 'q4']);
    expect(settings.blacklist).toEqual([]);
  });
});

describe('sanitizeStudioGenerateState', () => {
  it('rebuilds every type even when only one was persisted', () => {
    const state = sanitizeStudioGenerateState({
      settingsByType: { video: { aspectRatio: '9:16' } },
      type: 'video',
    });

    expect(state.type).toBe('video');
    expect(state.settingsByType.video.aspectRatio).toBe('9:16');
    expect(state.settingsByType.image.aspectRatio).toBe('1:1');
    expect(state.settingsByType.voice.brandingMode).toBe('brand');
  });

  it('falls back to the image tab for an unknown persisted type', () => {
    expect(sanitizeStudioGenerateState({ type: 'gif' }).type).toBe('image');
    expect(sanitizeStudioGenerateState(undefined).type).toBe('image');
  });
});

import { RouterPriority } from '@genfeedai/contracts';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { describe, expect, it } from 'vitest';
import {
  getDefaultStudioPlaygroundState,
  STUDIO_PLAYGROUND_STORAGE_KEY,
  sanitizeStudioPlaygroundSettings,
  sanitizeStudioPlaygroundState,
  writeStudioPlaygroundState,
} from './studio-playground-storage';

describe('getDefaultStudioPlaygroundState', () => {
  it('seeds every type with brand enrichment on and auto routing', () => {
    const state = getDefaultStudioPlaygroundState();

    expect(state.type).toBe('image');
    expect(Object.keys(state.settingsByType).toSorted()).toEqual([
      'avatar',
      'image',
      'image-edit',
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

describe('sanitizeStudioPlaygroundSettings', () => {
  it('falls back to defaults for a non-object payload', () => {
    expect(sanitizeStudioPlaygroundSettings('image', null).aspectRatio).toBe(
      '1:1',
    );
    expect(sanitizeStudioPlaygroundSettings('image', 'nope').outputs).toBe(1);
  });

  it('keeps values that are still on the current option ladder', () => {
    const settings = sanitizeStudioPlaygroundSettings('image', {
      aspectRatio: '16:9',
      outputs: 4,
      resolution: '2K',
    });

    expect(settings.aspectRatio).toBe('16:9');
    expect(settings.outputs).toBe(4);
    expect(settings.resolution).toBe('2K');
  });

  it('drops a persisted value the current ladder no longer offers', () => {
    const settings = sanitizeStudioPlaygroundSettings('image', {
      aspectRatio: '32:9',
      resolution: '8K',
    });

    expect(settings.aspectRatio).toBe('1:1');
    expect(settings.resolution).toBe('1K');
  });

  it('clamps an out-of-range outputs count back to the default', () => {
    expect(
      sanitizeStudioPlaygroundSettings('image', { outputs: 99 }).outputs,
    ).toBe(1);
    expect(
      sanitizeStudioPlaygroundSettings('image', { outputs: 0 }).outputs,
    ).toBe(1);
    expect(
      sanitizeStudioPlaygroundSettings('image', { outputs: 2.5 }).outputs,
    ).toBe(1);
  });

  it('restores a persisted video duration but rejects an unsupported one', () => {
    expect(
      sanitizeStudioPlaygroundSettings('video', { duration: 8 }).duration,
    ).toBe(8);
    expect(
      sanitizeStudioPlaygroundSettings('video', { duration: 42 }).duration,
    ).toBe(5);
  });

  it('validates a persisted video resolution against its selected model', () => {
    expect(
      sanitizeStudioPlaygroundSettings('video', {
        modelKey: 'kwaivgi/kling-v3-omni-video',
        resolution: '4k',
      }).resolution,
    ).toBe('4k');
    expect(
      sanitizeStudioPlaygroundSettings('video', {
        modelKey: 'google/veo-3.1',
        resolution: '4k',
      }).resolution,
    ).toBe('720p');
  });

  it('never restores speech copy from a previous session', () => {
    expect(
      sanitizeStudioPlaygroundSettings('voice', { speech: 'old script' })
        .speech,
    ).toBeUndefined();
  });

  it('keeps branding on unless it was explicitly turned off', () => {
    expect(
      sanitizeStudioPlaygroundSettings('image', { brandingMode: 'off' })
        .brandingMode,
    ).toBe('off');
    expect(
      sanitizeStudioPlaygroundSettings('image', { brandingMode: 'nonsense' })
        .brandingMode,
    ).toBe('brand');
    expect(sanitizeStudioPlaygroundSettings('image', {}).brandingMode).toBe(
      'brand',
    );
  });

  it('restores a persisted router priority and rejects an unknown one', () => {
    expect(
      sanitizeStudioPlaygroundSettings('image', {
        prioritize: RouterPriority.QUALITY,
      }).prioritize,
    ).toBe(RouterPriority.QUALITY);
    expect(
      sanitizeStudioPlaygroundSettings('image', { prioritize: 'fastest' })
        .prioritize,
    ).toBe(RouterPriority.BALANCED);
  });

  it('restores the chosen portrait url for avatar', () => {
    expect(
      sanitizeStudioPlaygroundSettings('avatar', {
        avatarPhotoUrl: 'https://cdn.genfeed.test/portrait.png',
      }).avatarPhotoUrl,
    ).toBe('https://cdn.genfeed.test/portrait.png');
  });

  it('keeps Look elements and drops blank ones', () => {
    const settings = sanitizeStudioPlaygroundSettings('image', {
      lighting: '   ',
      mood: 'confident',
      style: 'editorial',
    });

    expect(settings.mood).toBe('confident');
    expect(settings.style).toBe('editorial');
    expect(settings.lighting).toBeUndefined();
  });

  it('rejects non-string entries inside tag and blacklist arrays', () => {
    const settings = sanitizeStudioPlaygroundSettings('image', {
      blacklist: 'not-an-array',
      tags: ['launch', 7, null, 'q4'],
    });

    expect(settings.tags).toEqual(['launch', 'q4']);
    expect(settings.blacklist).toEqual([]);
  });
});

describe('sanitizeStudioPlaygroundState', () => {
  it('rebuilds every type even when only one was persisted', () => {
    const state = sanitizeStudioPlaygroundState({
      settingsByType: { video: { aspectRatio: '9:16' } },
      type: 'video',
    });

    expect(state.type).toBe('video');
    expect(state.settingsByType.video.aspectRatio).toBe('9:16');
    expect(state.settingsByType.image.aspectRatio).toBe('1:1');
    expect(state.settingsByType.voice.brandingMode).toBe('brand');
  });

  it('falls back to the image tab for an unknown persisted type', () => {
    expect(sanitizeStudioPlaygroundState({ type: 'gif' }).type).toBe('image');
    expect(sanitizeStudioPlaygroundState(undefined).type).toBe('image');
  });
});

describe('Crun video generic storage boundary', () => {
  it('retains typed draft settings but never negative copy, references, quote or secret URL', () => {
    const settings = sanitizeStudioPlaygroundSettings('video', {
      modelKey: 'crun/google/veo3-1-fast-t2v',
      duration: 8,
      resolution: '4k',
      crunControls: {
        modelKey: 'crun/google/veo3-1-fast-t2v',
        contractVersion: 'reviewed-video-v1',
        translatePrompt: false,
        guidanceScale: 0,
        negativePrompt: 'secret copy',
        quoteId: 'secret quote',
        references: ['secret signed URL'],
      },
    });
    expect(settings).toMatchObject({
      duration: 8,
      resolution: '4k',
      crunControls: { translatePrompt: false, guidanceScale: 0 },
    });
    expect(settings.crunControls).not.toHaveProperty('negativePrompt');
    expect(settings.crunControls).not.toHaveProperty('quoteId');
    expect(settings.crunControls).not.toHaveProperty('references');
  });
});

it('does not write negative prompt text to generic local settings storage', () => {
  const state = getDefaultStudioPlaygroundState();
  state.settingsByType.video.crunControls = {
    modelKey: 'crun/kling/v2-5-turbo-pro',
    contractVersion: 'video-v1',
    negativePrompt: 'private negative copy',
    guidanceScale: 0,
  };
  state.settingsByType.video.modelKey = 'crun/kling/v2-5-turbo-pro';
  writeStudioPlaygroundState(state);
  const stored = window.localStorage.getItem(STUDIO_PLAYGROUND_STORAGE_KEY);
  expect(stored).not.toContain('private negative copy');
  expect(stored).toContain('"guidanceScale":0');
  expect(state.settingsByType.video.crunControls.negativePrompt).toBe(
    'private negative copy',
  );
});

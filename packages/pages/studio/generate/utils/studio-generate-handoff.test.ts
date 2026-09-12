import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildStudioSettingsPatchFromHandoff,
  studioHandoffReferenceRole,
} from './studio-generate-handoff';

function handoff(
  overrides: Partial<AgentStudioHandoffPayload> = {},
): AgentStudioHandoffPayload {
  return {
    brandId: 'brand-1',
    modelKey: 'provider/model-x',
    prompt: 'A futuristic city at sunset',
    type: 'image',
    ...overrides,
  };
}

describe('buildStudioSettingsPatchFromHandoff', () => {
  it('maps an image handoff to aspect ratio, model, and output count', () => {
    const patch = buildStudioSettingsPatchFromHandoff(
      handoff({
        aspectRatio: '1:1',
        outputs: 4,
        type: 'image',
      }),
    );

    expect(patch).toEqual({
      aspectRatio: '1:1',
      modelKey: 'provider/model-x',
      outputs: 4,
    });
  });

  it('maps a video handoff to aspect ratio, duration, and model', () => {
    const patch = buildStudioSettingsPatchFromHandoff(
      handoff({
        aspectRatio: '16:9',
        duration: 8,
        type: 'video',
      }),
    );

    expect(patch).toEqual({
      aspectRatio: '16:9',
      duration: 8,
      modelKey: 'provider/model-x',
    });
  });

  it('maps an avatar handoff to the identity photo', () => {
    const patch = buildStudioSettingsPatchFromHandoff(
      handoff({
        avatarPhotoUrl: 'https://cdn.test/portrait.png',
        type: 'avatar',
      }),
    );

    expect(patch).toEqual({
      avatarPhotoUrl: 'https://cdn.test/portrait.png',
      modelKey: 'provider/model-x',
    });
  });

  it('maps a voice handoff to the provider voice id', () => {
    const patch = buildStudioSettingsPatchFromHandoff(
      handoff({ type: 'voice', voiceId: 'voice-1' }),
    );

    expect(patch).toEqual({
      modelKey: 'provider/model-x',
      voiceId: 'voice-1',
    });
  });

  it('maps a music handoff to just the resolved model', () => {
    const patch = buildStudioSettingsPatchFromHandoff(
      handoff({ type: 'music' }),
    );

    expect(patch).toEqual({ modelKey: 'provider/model-x' });
  });

  it('always includes modelKey — the Agent never hands off "auto"', () => {
    const patch = buildStudioSettingsPatchFromHandoff(handoff());
    expect(patch.modelKey).toBe('provider/model-x');
  });

  it('omits resolution when the handoff did not carry one', () => {
    const patch = buildStudioSettingsPatchFromHandoff(handoff());
    expect(patch).not.toHaveProperty('resolution');
  });

  it('maps resolution when present', () => {
    const patch = buildStudioSettingsPatchFromHandoff(
      handoff({ resolution: '4k' }),
    );
    expect(patch.resolution).toBe('4k');
  });
});

describe('studioHandoffReferenceRole', () => {
  it('treats a video handoff reference as the start frame', () => {
    expect(studioHandoffReferenceRole('video')).toBe('startFrame');
  });

  it('treats every other type as a plain reference', () => {
    expect(studioHandoffReferenceRole('image')).toBe('reference');
    expect(studioHandoffReferenceRole('music')).toBe('reference');
    expect(studioHandoffReferenceRole('avatar')).toBe('reference');
    expect(studioHandoffReferenceRole('voice')).toBe('reference');
  });
});

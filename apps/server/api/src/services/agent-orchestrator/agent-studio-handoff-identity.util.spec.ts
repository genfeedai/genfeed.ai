import { describe, expect, it } from 'vitest';
import {
  omitUnattachedStudioHandoffIdentity,
  pickStudioHandoffIdentityFields,
  resolveStudioHandoffPayloadType,
  shouldAttachStudioHandoffIdentity,
} from './agent-studio-handoff-identity.util';

describe('shouldAttachStudioHandoffIdentity', () => {
  it('attaches identity for avatar and voice types even without the flag', () => {
    expect(shouldAttachStudioHandoffIdentity('avatar')).toBe(true);
    expect(shouldAttachStudioHandoffIdentity('voice')).toBe(true);
  });

  it('attaches identity for image/video only when the generation used it', () => {
    expect(shouldAttachStudioHandoffIdentity('image')).toBe(false);
    expect(shouldAttachStudioHandoffIdentity('video')).toBe(false);
    expect(shouldAttachStudioHandoffIdentity('video', true)).toBe(true);
  });
});

describe('resolveStudioHandoffPayloadType', () => {
  it('opens identity generations as avatar so Studio shows the identity fields', () => {
    expect(resolveStudioHandoffPayloadType('video', true)).toBe('avatar');
    expect(resolveStudioHandoffPayloadType('image', true)).toBe('avatar');
  });

  it('keeps an explicit avatar, voice, or music type', () => {
    expect(resolveStudioHandoffPayloadType('avatar', true)).toBe('avatar');
    expect(resolveStudioHandoffPayloadType('voice', true)).toBe('voice');
    expect(resolveStudioHandoffPayloadType('music', true)).toBe('music');
  });

  it('leaves ordinary image/video handoffs alone', () => {
    expect(resolveStudioHandoffPayloadType('image')).toBe('image');
    expect(resolveStudioHandoffPayloadType('video')).toBe('video');
  });
});

describe('pickStudioHandoffIdentityFields', () => {
  it('keeps only non-empty portrait and voice values', () => {
    expect(
      pickStudioHandoffIdentityFields({
        avatarPhotoUrl: ' https://cdn.test/portrait.png ',
        voiceId: 'voice-1',
      }),
    ).toEqual({
      avatarPhotoUrl: 'https://cdn.test/portrait.png',
      voiceId: 'voice-1',
    });
  });

  it('omits blank identity values rather than substituting defaults', () => {
    expect(
      pickStudioHandoffIdentityFields({
        avatarPhotoUrl: '  ',
        voiceId: undefined,
      }),
    ).toEqual({});
  });
});

describe('omitUnattachedStudioHandoffIdentity', () => {
  it('strips client-supplied identity from a non-identity handoff', () => {
    expect(
      omitUnattachedStudioHandoffIdentity({
        avatarPhotoUrl: 'https://cdn.test/other.png',
        brandId: 'brand-1',
        modelKey: 'provider/model-x',
        prompt: 'a red car',
        type: 'image',
        useIdentity: true,
        voiceId: 'foreign-voice',
      }),
    ).toEqual({
      brandId: 'brand-1',
      modelKey: 'provider/model-x',
      prompt: 'a red car',
      type: 'image',
    });
  });
});

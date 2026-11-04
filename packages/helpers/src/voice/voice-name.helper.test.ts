import { getVoiceName } from '@helpers/voice/voice-name.helper';
import { describe, expect, it } from 'vitest';

describe('getVoiceName', () => {
  it.each([
    [{ externalVoiceId: 'ext-1', id: 'v1', metadataLabel: 'Aria' }, 'Aria'],
    [{ externalVoiceId: 'ext-1', id: 'v1', metadataLabel: '' }, 'ext-1'],
    [{ externalVoiceId: 'ext-1', id: 'v1' }, 'ext-1'],
    [{ id: 'v1' }, 'v1'],
  ])('resolves %j to %s', (voice, expected) => {
    expect(getVoiceName(voice)).toBe(expected);
  });
});

import {
  AVATAR_SPEECH_CHARACTERS_PER_SECOND,
  estimateAvatarSpeechSeconds,
} from '@api/collections/videos/services/avatar-video-duration.util';
import { describe, expect, it } from 'vitest';

describe('estimateAvatarSpeechSeconds', () => {
  it('rounds the script up to whole seconds at the slow speaking rate', () => {
    expect(
      estimateAvatarSpeechSeconds(
        'a'.repeat(AVATAR_SPEECH_CHARACTERS_PER_SECOND),
      ),
    ).toBe(1);
    expect(
      estimateAvatarSpeechSeconds(
        'a'.repeat(AVATAR_SPEECH_CHARACTERS_PER_SECOND + 1),
      ),
    ).toBe(2);
  });

  it('counts code points, so an emoji is one character', () => {
    expect(estimateAvatarSpeechSeconds('👋'.repeat(24))).toBe(2);
  });

  it('never estimates below one second and ignores surrounding whitespace', () => {
    expect(estimateAvatarSpeechSeconds('  Hi  ')).toBe(1);
  });
});

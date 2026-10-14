import {
  AVATAR_SPEECH_CHARACTERS_PER_SECOND,
  AVATAR_SYLLABIC_CHARACTERS_PER_SECOND,
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

  it('reads Han, kana and Hangul at the syllabic rate', () => {
    expect(AVATAR_SYLLABIC_CHARACTERS_PER_SECOND).toBe(5);
    // 50 Han characters: 10 s, not the 5 s the alphabetic rate would hold.
    expect(estimateAvatarSpeechSeconds('你'.repeat(50))).toBe(10);
    expect(estimateAvatarSpeechSeconds('こんにちは世界'.repeat(5))).toBe(7);
    expect(estimateAvatarSpeechSeconds('안녕하세요'.repeat(4))).toBe(4);
  });

  it('sums a mixed script per character', () => {
    // 6 Latin characters (0.5 s) and 10 Han characters (2 s) are 2.5 s.
    expect(estimateAvatarSpeechSeconds(`hello ${'世'.repeat(10)}`)).toBe(3);
  });

  it('keeps CJK punctuation and Latin text at the alphabetic rate', () => {
    expect(estimateAvatarSpeechSeconds('。'.repeat(24))).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  hasExactGrantedScope,
  hasYoutubeDataScope,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_SCOPE,
} from './youtube-authorized-signals-evidence.mapper';

describe('hasExactGrantedScope', () => {
  it('matches only the exact granted scope string', () => {
    expect(hasExactGrantedScope([YOUTUBE_SCOPE], YOUTUBE_SCOPE)).toBe(true);
    expect(
      hasExactGrantedScope(
        [`https://evil.example/${YOUTUBE_SCOPE}`],
        YOUTUBE_SCOPE,
      ),
    ).toBe(false);
    expect(
      hasExactGrantedScope([`${YOUTUBE_SCOPE}.readonly`], YOUTUBE_SCOPE),
    ).toBe(false);
  });
});

describe('hasYoutubeDataScope', () => {
  it('accepts youtube and youtube.readonly grants', () => {
    expect(hasYoutubeDataScope([YOUTUBE_SCOPE])).toBe(true);
    expect(hasYoutubeDataScope([YOUTUBE_READONLY_SCOPE])).toBe(true);
    expect(hasYoutubeDataScope(['https://www.googleapis.com/auth/drive'])).toBe(
      false,
    );
  });
});

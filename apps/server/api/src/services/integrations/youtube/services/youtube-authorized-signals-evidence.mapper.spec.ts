import { describe, expect, it } from 'vitest';
import {
  dataRequiredScopes,
  hasExactGrantedScope,
  hasYoutubeDataScope,
  hasYoutubePublishScope,
  publishRequiredScopes,
  YOUTUBE_FORCE_SSL_SCOPE,
  YOUTUBE_READONLY_SCOPE,
  YOUTUBE_SCOPE,
  YOUTUBE_UPLOAD_SCOPE,
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
  it('accepts youtube.force-ssl, youtube, and youtube.readonly grants', () => {
    expect(hasYoutubeDataScope([YOUTUBE_FORCE_SSL_SCOPE])).toBe(true);
    expect(hasYoutubeDataScope([YOUTUBE_SCOPE])).toBe(true);
    expect(hasYoutubeDataScope([YOUTUBE_READONLY_SCOPE])).toBe(true);
    expect(hasYoutubeDataScope([YOUTUBE_UPLOAD_SCOPE])).toBe(false);
    expect(hasYoutubeDataScope(['https://www.googleapis.com/auth/drive'])).toBe(
      false,
    );
  });
});

describe('hasYoutubePublishScope', () => {
  it('accepts youtube.force-ssl, youtube, and youtube.upload grants', () => {
    expect(hasYoutubePublishScope([YOUTUBE_FORCE_SSL_SCOPE])).toBe(true);
    expect(hasYoutubePublishScope([YOUTUBE_SCOPE])).toBe(true);
    expect(hasYoutubePublishScope([YOUTUBE_UPLOAD_SCOPE])).toBe(true);
    expect(hasYoutubePublishScope([YOUTUBE_READONLY_SCOPE])).toBe(false);
  });
});

describe('required YouTube scopes', () => {
  it('reports the scope a credential actually holds', () => {
    expect(dataRequiredScopes([YOUTUBE_SCOPE])).toEqual([YOUTUBE_SCOPE]);
    expect(dataRequiredScopes([YOUTUBE_READONLY_SCOPE])).toEqual([
      YOUTUBE_READONLY_SCOPE,
    ]);
    expect(publishRequiredScopes([YOUTUBE_UPLOAD_SCOPE])).toEqual([
      YOUTUBE_UPLOAD_SCOPE,
    ]);
  });

  it('asks a credential without a usable grant for the scope connect requests', () => {
    expect(dataRequiredScopes([])).toEqual([YOUTUBE_FORCE_SSL_SCOPE]);
    expect(publishRequiredScopes([YOUTUBE_READONLY_SCOPE])).toEqual([
      YOUTUBE_FORCE_SSL_SCOPE,
    ]);
  });
});

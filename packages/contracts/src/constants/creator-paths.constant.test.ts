import { describe, expect, it } from 'vitest';
import {
  articleHandle,
  creatorArticlePath,
  creatorArticlePreviewPath,
  creatorInvitePath,
  creatorPostPath,
  creatorProfilePath,
  creatorTabPath,
} from './creator-paths.constant';

describe('creator-paths.constant', () => {
  it('builds the profile and tab paths under @handle', () => {
    expect(creatorProfilePath('genfeedai')).toBe('/@genfeedai');
    expect(creatorTabPath('genfeedai', 'videos')).toBe('/@genfeedai/videos');
  });

  it('nests articles and their previews under the handle', () => {
    expect(creatorArticlePath('genfeedai', 'launch-week')).toBe(
      '/@genfeedai/articles/launch-week',
    );
    expect(creatorArticlePreviewPath('genfeedai', 'launch-week')).toBe(
      '/@genfeedai/articles/launch-week/preview',
    );
  });

  it('encodes post ids and invite tokens', () => {
    expect(creatorPostPath('shayla', 'post 1')).toBe('/@shayla/posts/post%201');
    expect(creatorInvitePath('shayla', 'a/b')).toBe('/@shayla/invite/a%2Fb');
  });

  it.each([
    ['shayla', 'shayla'],
    [null, 'genfeedai'],
    [undefined, 'genfeedai'],
    ['', 'genfeedai'],
  ])('resolves the article handle for brand slug %j', (slug, expected) => {
    expect(articleHandle(slug)).toBe(expected);
  });
});

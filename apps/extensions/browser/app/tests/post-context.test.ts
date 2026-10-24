import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~platforms/twitter-selectors', () => ({
  findElement: vi.fn(),
}));

import { platforms } from '~platforms/config';
import { extractPostContext } from '~platforms/post-context';
import { findElement } from '~platforms/twitter-selectors';

describe('extractPostContext', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.mocked(findElement).mockReset();
  });

  it('reads the post and author on X', () => {
    document.body.innerHTML = `
      <article>
        <div data-testid="User-Name"><a>Ada Lovelace</a><span>@ada</span></div>
        <div data-testid="tweetText">We just launched our public API.</div>
      </article>`;

    expect(extractPostContext(platforms.twitter)).toEqual({
      author: 'Ada Lovelace',
      content: 'We just launched our public API.',
    });
  });

  it('falls back to the author element when X has no link in it', () => {
    document.body.innerHTML = `
      <div data-testid="User-Name">Ada Lovelace</div>
      <div data-testid="tweetText">Hello</div>`;

    expect(extractPostContext(platforms.twitter).author).toBe('Ada Lovelace');
  });

  it('uses X selector chains when the primary selectors miss', () => {
    document.body.innerHTML =
      '<p id="t">Chain text</p><p id="u">Chain user</p>';
    vi.mocked(findElement).mockImplementation(((key: string) =>
      document.querySelector(key === 'tweetText' ? '#t' : '#u')) as never);

    expect(extractPostContext(platforms.twitter)).toEqual({
      author: 'Chain user',
      content: 'Chain text',
    });
  });

  it.each([
    [
      'linkedin',
      '<div class="update-components-actor__name">Grace</div><div class="feed-shared-text">Shipping today</div>',
    ],
    [
      'reddit',
      '<a href="/user/grace">grace</a><div data-testid="post-content">Shipping today</div>',
    ],
    [
      'facebook',
      '<h2 dir="auto"><a>Grace</a></h2><div data-testid="post_message">Shipping today</div>',
    ],
  ])('reads %s with its own selectors', (name, markup) => {
    document.body.innerHTML = markup;

    const context = extractPostContext(platforms[name]);

    expect(context.content).toBe('Shipping today');
    expect(context.author).toMatch(/Grace|grace/);
  });

  it('limits the read to one post when a container is given', () => {
    document.body.innerHTML = `
      <article id="a"><div data-testid="tweetText">First post</div></article>
      <article id="b"><div data-testid="tweetText">Second post</div></article>`;

    expect(
      extractPostContext(
        platforms.twitter,
        document.getElementById('b') as HTMLElement,
      ).content,
    ).toBe('Second post');
  });

  it('falls back to link-preview metadata on a platform without post markup', () => {
    document.head.innerHTML = `
      <meta property="og:description" content="A short clip about launches">
      <meta name="author" content="Grace Hopper">`;

    expect(extractPostContext(platforms.threads)).toEqual({
      author: 'Grace Hopper',
      content: 'A short clip about launches',
    });
  });

  it('returns empty text rather than failing on an unknown page', () => {
    expect(extractPostContext(null)).toEqual({ author: '', content: '' });
  });
});

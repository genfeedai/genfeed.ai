import { afterEach, describe, expect, it, vi } from 'vitest';

import { platforms } from '~platforms/config';
import { readPagePost } from '~platforms/page-post';

function article(id: string, name: string, text: string): string {
  return `
    <article data-testid="tweet">
      <div data-testid="Tweet-User-Avatar"><img src="https://pbs.twimg.com/${id}.jpg" /></div>
      <div data-testid="User-Name">
        <a href="/${name}"><span>${name[0].toUpperCase()}${name.slice(1)}</span></a>
        <a href="/${name}"><span>@${name}</span></a>
        <a href="/${name}/status/${id}"><time>Oct 25</time></a>
      </div>
      <div data-testid="tweetText">${text}</div>
    </article>`;
}

describe('readPagePost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('reads the post a status page is about, not the replies under it', () => {
    vi.stubGlobal('location', new URL('https://x.com/marcel/status/222'));
    document.body.innerHTML =
      article('111', 'ada', 'A quoted post above') +
      article('222', 'marcel', 'UI so clean it looks native') +
      article('333', 'grace', 'A reply');

    expect(readPagePost(platforms.twitter)).toEqual({
      authorHandle: '@marcel',
      authorName: 'Marcel',
      avatarUrl: 'https://pbs.twimg.com/222.jpg',
      text: 'UI so clean it looks native',
      url: expect.stringContaining('/status/222'),
    });
  });

  it('has no post on a feed', () => {
    vi.stubGlobal('location', new URL('https://x.com/home'));
    document.body.innerHTML = article('222', 'marcel', 'A post in the feed');

    expect(readPagePost(platforms.twitter)).toBeNull();
  });
});

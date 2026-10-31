import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractSourceCapture } from '../src/platforms/source-capture-extract';

function stubLocation(href: string): void {
  const url = new URL(href);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: url.href,
      hostname: url.hostname,
      pathname: url.pathname,
      search: url.search,
    },
  });
}

function setPage(href: string, html: string, title = ''): void {
  stubLocation(href);
  document.head.innerHTML = '';
  document.body.innerHTML = html;
  document.title = title;
}

function head(html: string): void {
  document.head.innerHTML = html;
}

beforeEach(() => {
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  stubLocation('https://example.com/');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('X post capture', () => {
  const timeline = `
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/other">Other Person</a></div>
      <div data-testid="tweetText">A different post in the timeline.</div>
      <a href="/other/status/999"><time>2h</time></a>
    </article>
    <article data-testid="tweet">
      <div data-testid="User-Name"><a href="/author">Author Name</a><a href="/author">@author</a></div>
      <div data-testid="tweetText"><span>Launching our public API today.</span></div>
      <a href="/author/status/123"><time>1h</time></a>
      <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/abc.jpg" alt="Chart"></div>
      <div data-testid="tweetPhoto"><img src="blob:https://x.com/not-public" alt="Local"></div>
    </article>`;

  it('captures the opened post identity, author, text and image, not the timeline', () => {
    setPage('https://x.com/author/status/123', timeline);
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw).toMatchObject({
      author: 'Author Name',
      authorHandle: 'author',
      canonicalUrl: 'https://x.com/author/status/123',
      externalIdentity: '123',
      host: 'x',
      isSelection: false,
      text: 'Launching our public API today.',
    });
    expect(raw.text).not.toContain('timeline');
    expect(raw.media).toEqual([
      {
        kind: 'image',
        label: 'Chart',
        origin: 'element',
        url: 'https://pbs.twimg.com/media/abc.jpg',
      },
    ]);
  });

  it('records a platform video as a player, never a file', () => {
    setPage(
      'https://x.com/author/status/123',
      `<article data-testid="tweet"><a href="/author/status/123"><time>1h</time></a><div data-testid="tweetText">Watch</div><div data-testid="videoPlayer"><video src="blob:https://x.com/1"></video></div></article>`,
    );
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw.media).toEqual([
      {
        kind: 'video',
        label: 'Post video',
        origin: 'player',
        url: 'https://x.com/author/status/123',
      },
    ]);
  });

  it('captures only a link when no single post is open', () => {
    setPage('https://x.com/home', timeline, 'Home / X');
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw.text).toBe('');
    expect(raw.limitation).toMatch(/single post/);
    expect(raw.canonicalUrl).toBeUndefined();
  });

  it('says so when the opened post is not rendered yet', () => {
    setPage('https://x.com/author/status/123', '<main></main>', 'X');
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw.limitation).toMatch(/not visible/);
    expect(raw.text).toBe('');
  });
});

describe('Reddit post capture', () => {
  it('captures the post title, author, permalink and body', () => {
    setPage(
      'https://www.reddit.com/r/test/comments/abc123/a_title/',
      `<shreddit-post post-title="A useful thread" author="poster" permalink="/r/test/comments/abc123/a_title/" id="t3_abc123"><div slot="text-body">The body of the post.</div><div slot="post-media-container"><img src="https://preview.redd.it/pic.jpg" alt="Photo"></div></shreddit-post><shreddit-post post-title="Sibling" author="other" permalink="/r/test/comments/zzz/"></shreddit-post>`,
    );
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw).toMatchObject({
      author: 'poster',
      authorHandle: 'poster',
      canonicalUrl: 'https://www.reddit.com/r/test/comments/abc123/a_title/',
      externalIdentity: 'abc123',
      host: 'reddit',
      text: 'The body of the post.',
      title: 'A useful thread',
    });
    expect(raw.media[0]).toMatchObject({
      kind: 'image',
      url: 'https://preview.redd.it/pic.jpg',
    });
  });

  it('does not capture a subreddit listing', () => {
    setPage(
      'https://www.reddit.com/r/test/',
      '<shreddit-post post-title="One"></shreddit-post>',
      'Test',
    );
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw.limitation).toMatch(/single post/);
    expect(raw.text).toBe('');
  });
});

describe('YouTube video capture', () => {
  it('captures the video identity and public description as an embedded player', () => {
    setPage(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      `<ytd-watch-metadata><h1>How it works</h1><ytd-channel-name><a href="/@channel">Channel Name</a></ytd-channel-name></ytd-watch-metadata>`,
    );
    head(
      '<meta property="og:description" content="A public description of the video.">',
    );
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw).toMatchObject({
      author: 'Channel Name',
      authorHandle: 'channel',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      externalIdentity: 'dQw4w9WgXcQ',
      host: 'youtube',
      text: 'A public description of the video.',
      title: 'How it works',
    });
    expect(raw.media).toEqual([
      {
        kind: 'video',
        label: 'YouTube video',
        origin: 'player',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    ]);
  });

  it('captures only a link away from a watch page', () => {
    setPage('https://www.youtube.com/', '<main>Recommended</main>', 'YouTube');
    expect(extractSourceCapture({ scope: 'page' }).limitation).toMatch(
      /Open a video/,
    );
  });
});

describe('article, newsletter and podcast capture', () => {
  it('captures visible article text, byline, structured types and media', () => {
    setPage(
      'https://blog.example.com/posts/launch',
      `<main><article><h1>Launch notes</h1><p>${'Useful visible paragraph. '.repeat(20)}</p><p hidden>hidden secret</p><p style="display:none">css secret</p><form><input value="private"></form><img src="https://blog.example.com/chart.png" alt="Chart" width="640"><audio src="https://blog.example.com/episode.mp3" title="Episode"></audio></article></main><iframe src="https://www.youtube.com/embed/abc123" title="Demo"></iframe>`,
      'Launch notes | Blog',
    );
    head(`
      <link rel="canonical" href="https://blog.example.com/posts/launch">
      <meta property="og:title" content="Launch notes">
      <meta property="og:type" content="article">
      <meta property="og:image" content="https://blog.example.com/og.png">
      <meta name="author" content="Jane Writer">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","author":{"@type":"Person","name":"Ignored"}}</script>`);
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw.title).toBe('Launch notes');
    expect(raw.author).toBe('Jane Writer');
    expect(raw.canonicalUrl).toBe('https://blog.example.com/posts/launch');
    expect(raw.typeHints).toEqual(
      expect.arrayContaining(['newsarticle', 'article']),
    );
    expect(raw.text).toContain('Useful visible paragraph.');
    expect(raw.text).not.toContain('hidden secret');
    expect(raw.text).not.toContain('css secret');
    expect(raw.text).not.toContain('private');
    expect(raw.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'audio',
          origin: 'element',
          url: 'https://blog.example.com/episode.mp3',
        }),
        expect.objectContaining({
          kind: 'video',
          origin: 'player',
          url: 'https://www.youtube.com/embed/abc123',
        }),
        expect.objectContaining({
          kind: 'image',
          url: 'https://blog.example.com/chart.png',
        }),
        expect.objectContaining({
          kind: 'image',
          origin: 'meta',
          url: 'https://blog.example.com/og.png',
        }),
      ]),
    );
  });

  it('reads structured-data podcast audio and an audio link', () => {
    setPage(
      'https://podcast.example.com/ep/1',
      '<main><p>Show notes.</p><a href="/files/ep1.mp3">Download episode</a></main>',
      'Episode 1',
    );
    head(
      '<script type="application/ld+json">{"@type":"PodcastEpisode","name":"Episode 1","associatedMedia":{"@type":"AudioObject","contentUrl":"https://cdn.example.com/ep1.mp3"}}</script>',
    );
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw.typeHints).toContain('podcastepisode');
    expect(raw.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'audio',
          origin: 'structured-data',
          url: 'https://cdn.example.com/ep1.mp3',
        }),
        expect.objectContaining({
          kind: 'audio',
          origin: 'link',
          url: 'https://podcast.example.com/files/ep1.mp3',
        }),
      ]),
    );
  });

  it('captures only the selected passage for a selection capture', () => {
    setPage(
      'https://blog.example.com/a',
      '<main><p id="a">before chosen passage after</p><p>other paragraph</p></main>',
    );
    const node = document.querySelector('#a')?.firstChild;
    if (!node) throw new Error('Missing fixture');
    const range = document.createRange();
    range.setStart(node, 7);
    range.setEnd(node, 21);
    window.getSelection()?.addRange(range);
    const raw = extractSourceCapture({ scope: 'selection' });
    expect(raw.text).toBe('chosen passage');
    expect(raw.isSelection).toBe(true);
    // A page capture ignores whatever happens to be highlighted.
    const page = extractSourceCapture({ scope: 'page' });
    expect(page.isSelection).toBe(false);
    expect(page.text).toContain('other paragraph');
  });

  it('puts a right-clicked media file first and reads no page text', () => {
    setPage(
      'https://blog.example.com/a',
      '<main><article><p>Long text that is not part of an image source.</p></article></main>',
      'A page',
    );
    const raw = extractSourceCapture({
      mediaKind: 'image',
      scope: 'media',
      targetUrl: 'https://cdn.example.com/photo.jpg',
    });
    expect(raw.text).toBe('');
    expect(raw.media[0]).toEqual({
      kind: 'image',
      label: 'Selected media',
      origin: 'selected',
      url: 'https://cdn.example.com/photo.jpg',
    });
  });

  it('captures only the target for a link capture', () => {
    setPage('https://blog.example.com/a', '<main>Text</main>');
    const raw = extractSourceCapture({
      scope: 'link',
      targetUrl: 'https://other.example.com/read',
    });
    expect(raw).toMatchObject({
      media: [],
      text: '',
      title: 'other.example.com',
      url: 'https://other.example.com/read',
    });
  });

  it('refuses a page beyond the capture limit', () => {
    setPage(
      'https://blog.example.com/long',
      `<main><p>${'word '.repeat(30_000)}</p></main>`,
    );
    expect(() => extractSourceCapture({ scope: 'page' })).toThrow(
      /capture limit/,
    );
  });
});

describe('feed networks', () => {
  it('captures a link, not the signed-in feed', () => {
    setPage(
      'https://www.instagram.com/',
      '<main><article>Private feed post</article></main>',
      'Instagram',
    );
    const raw = extractSourceCapture({ scope: 'page' });
    expect(raw.host).toBe('social');
    expect(raw.text).toBe('');
    expect(raw.limitation).toMatch(/Select the passage/);
  });
});

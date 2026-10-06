// @vitest-environment jsdom

import { testId } from '@helpers/testing/test-id.helper';
import { cardResource } from '@mcp/ui/card-app';
import { buildCardView } from '@mcp/ui/card-data';

function message(
  method: string,
  params: unknown,
  source: Window = window.parent,
) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { jsonrpc: '2.0', method, params },
      source,
    }),
  );
}

function result(name: string, data: unknown) {
  message('ui/notifications/tool-result', {
    structuredContent: { genfeedCards: buildCardView(name, data) },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
    () => undefined,
  );
  const html = cardResource().text;
  document.documentElement.innerHTML = html.replace(
    /<script>[\s\S]*?<\/script>/g,
    '',
  );
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('Missing widget script');
  // Execute the exact script delivered by resources/read, not a duplicate renderer.
  new Function(script)();
});

afterEach(() => {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: { jsonrpc: '2.0', method: 'ui/resource-teardown', id: 900 },
    }),
  );
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('initializes the standard bridge and accepts host theme', async () => {
  expect(window.parent.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'ui/initialize' }),
    '*',
  );
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: {
        jsonrpc: '2.0',
        id: 1,
        result: { hostContext: { theme: 'dark' } },
      },
    }),
  );
  await Promise.resolve();
  expect(document.body.dataset.theme).toBe('dark');
  expect(window.parent.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'ui/notifications/initialized' }),
    '*',
  );
});

it('renders post content as text and ignores messages from other windows', () => {
  const payload = {
    structuredContent: {
      genfeedCards: buildCardView('get_posts', {
        posts: [
          {
            label: '<img src=x onerror=alert(1)>',
            description: '<script>bad()</script>',
          },
        ],
      }),
    },
  };
  message('ui/notifications/tool-result', payload, {} as Window);
  expect(document.querySelector('article')).toBeNull();
  message('ui/notifications/tool-result', payload);
  expect(document.querySelector('h3')?.textContent).toContain('<img');
  expect(document.querySelector('article img')).toBeNull();
  expect(document.querySelector('article script')).toBeNull();
});

it('renders image, video and audio controls using allowed origins', () => {
  result('list_assets', [
    { id: 'img', category: 'IMAGE', url: 'https://cdn.genfeed.ai/image.png' },
  ]);
  expect(document.querySelector('img')?.getAttribute('src')).toBe(
    'https://cdn.genfeed.ai/image.png',
  );
  result('list_assets', [
    {
      id: 'vid',
      category: 'VIDEO',
      url: 'https://cdn.genfeed.ai/video.mp4',
      status: 'COMPLETED',
    },
  ]);
  expect(
    document.querySelector('button[aria-label="Play video"]'),
  ).not.toBeNull();
  expect(document.querySelector('video')?.autoplay).toBe(false);
  result('list_assets', [
    { id: 'audio', category: 'MUSIC', url: 'https://cdn.genfeed.ai/music.mp3' },
  ]);
  expect(document.querySelector('button[aria-label^="Play "]')).not.toBeNull();
});

it('shows every generated caption in the existing post grid as safe text', () => {
  result('generate_content', {
    content: 'First caption',
    variations: [
      { content: 'First caption' },
      { content: '<img src=x onerror=alert(1)> Second caption' },
    ],
  });
  expect(document.querySelector('#cards')?.classList.contains('posts')).toBe(
    true,
  );
  expect(document.querySelectorAll('article.post')).toHaveLength(2);
  expect(
    Array.from(
      document.querySelectorAll('article.post h3'),
      (node) => node.textContent,
    ),
  ).toEqual(['Variation 1', 'Variation 2']);
  expect(
    Array.from(
      document.querySelectorAll('article.post .description'),
      (node) => node.textContent,
    ),
  ).toEqual(['First caption', '<img src=x onerror=alert(1)> Second caption']);
  expect(document.querySelector('article img')).toBeNull();
});

it('uses shared cards, badges, typography and the embedded product font', () => {
  result('generate_content', {
    content: 'A product caption',
    platform: 'instagram',
    status: 'draft',
  });
  const card = document.querySelector('article.post');
  expect(
    card
      ?.querySelector('[data-testid="preview-card"]')
      ?.classList.contains('shadow-border'),
  ).toBe(true);
  expect(card?.querySelector('.status')?.textContent).toBe('draft');
  expect(
    card?.querySelector('.description')?.classList.contains('text-sm'),
  ).toBe(true);
  expect(cardResource().text).toContain('@font-face');
  expect(cardResource().text).toContain('data:font/woff2;base64,');
  expect(cardResource().text).toContain('--font-satoshi: "Satoshi"');
});

it('presents completed images without tool headings or opaque metadata', async () => {
  const imageId = testId('image');
  result('get_job_status', {
    category: 'IMAGE',
    createdAt: '2026-10-05T11:45:12.000Z',
    id: imageId,
    status: 'GENERATED',
    url: `https://cdn.genfeed.ai/ingredients/images/${imageId}`,
  });

  expect(document.querySelector('header')?.hidden).toBe(true);
  expect(document.querySelector('.media-card h3')?.textContent).toBe('Image');
  expect(document.querySelector('article')?.textContent).not.toContain(imageId);
  expect(document.querySelector('article time')).toBeNull();
  expect(document.querySelector('article .meta')).toBeNull();
  expect(document.querySelector('article a')?.textContent).toBe('Open image ↗');
  document.querySelector<HTMLButtonElement>('.media-actions button')?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('[role="dialog"] img')).not.toBeNull();
});

it('keeps media descriptions available on demand and restores other layouts', async () => {
  result('get_job_status', {
    category: 'IMAGE',
    description: 'A logo on a white background',
    label: 'Genfeed logo',
    status: 'GENERATED',
    url: 'https://cdn.genfeed.ai/logo.jpg',
  });
  expect(document.querySelector('h3')?.textContent).toBe('Genfeed logo');
  const details = document.querySelector<HTMLButtonElement>(
    'article button[aria-expanded]',
  );
  expect(details?.getAttribute('aria-expanded')).toBe('false');
  details?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('article')?.textContent).toContain(
    'A logo on a white background',
  );
  result('get_posts', { posts: [{ label: 'Launch' }] });
  expect(document.querySelector('header')?.hidden).toBe(false);
  expect(document.body.classList.contains('media-view')).toBe(false);
  expect(document.querySelector('article.post')).not.toBeNull();
});

it('keeps a visible fallback when an attached post image fails', async () => {
  result('get_posts', {
    posts: [
      {
        label: 'Launch',
        media: [{ kind: 'image', url: 'https://cdn.genfeed.ai/missing.jpg' }],
      },
    ],
  });
  document.querySelector('article img')?.dispatchEvent(new Event('error'));
  await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('article .notice')?.textContent).toContain(
    'Preview unavailable',
  );
});

it('does not promise automatic updates when a pending job has no ID', () => {
  result('generate', { kind: 'image', status: 'PROCESSING' });
  expect(document.querySelector('.pending .notice')?.textContent).toBe(
    'Still generating. Ask for the job status again to see the result.',
  );
  expect(document.querySelector('.bar.indeterminate')).toBeNull();
});

it('uses open-link for external media without loading unapproved origins', async () => {
  result('list_assets', [
    { category: 'IMAGE', url: 'https://external.example/image.png' },
  ]);
  expect(document.querySelector('img')).toBeNull();
  document.querySelector('a')?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(window.parent.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'ui/open-link',
      params: { url: 'https://external.example/image.png' },
    }),
    '*',
  );
});

it('replaces content on empty, error and approval results', () => {
  result('get_posts', { posts: [{ id: 'p1', label: 'Post' }] });
  result('get_posts', { posts: [] });
  expect(document.querySelector('article')).toBeNull();
  expect(document.body.textContent).toContain('No content found.');
  message('ui/notifications/tool-result', {
    isError: true,
    content: [{ type: 'text', text: 'Rate limited' }],
  });
  expect(document.body.textContent).toContain('Rate limited');
  message('ui/notifications/tool-result', {
    content: [{ type: 'text', text: 'Approval required' }],
  });
  expect(document.body.textContent).toContain('Approval required');
});

it('shows long article text, usage zeroes, and truncated list counts', () => {
  result('get_articles', { title: 'Article', content: 'a'.repeat(900) });
  expect(document.querySelector('button[aria-expanded]')?.textContent).toBe(
    'Read more',
  );
  result('get_account', { usage: { currentBalance: 0 } });
  expect(document.querySelector('.metric')?.textContent).toBe('0');
  result(
    'list_assets',
    Array.from({ length: 30 }, (_, id) => ({ id: String(id) })),
  );
  expect(document.querySelectorAll('article')).toHaveLength(24);
  expect(document.querySelector('footer')?.textContent).toContain('24 of 30');
});

it('reports a failed handshake instead of loading indefinitely', async () => {
  await vi.advanceTimersByTimeAsync(10001);
  expect(document.body.textContent).toContain('could not initialize');
});

it('renders avatars that only supply a thumbnail', () => {
  result('list_assets', [
    {
      category: 'AVATAR',
      name: 'Avatar',
      thumbnailUrl: 'https://cdn.genfeed.ai/avatar.png',
    },
  ]);
  expect(document.querySelector('img')?.getAttribute('src')).toBe(
    'https://cdn.genfeed.ai/avatar.png',
  );
  expect(document.querySelector('a')?.href).toBe(
    'https://cdn.genfeed.ai/avatar.png',
  );
});

it('reports host open-link failures returned as results', async () => {
  result('list_assets', [
    { category: 'IMAGE', url: 'https://external.example/image.png' },
  ]);
  document.querySelector('a')?.click();
  await vi.advanceTimersByTimeAsync(0);
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: { jsonrpc: '2.0', id: 2, result: { isError: true } },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector('#notice')?.textContent).toContain(
    'could not open the link',
  );
});

it('reports natural body height so the host frame can shrink', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  const bounds = vi.spyOn(document.body, 'getBoundingClientRect');
  bounds.mockReturnValue({ height: 800 } as DOMRect);
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: { jsonrpc: '2.0', id: 1, result: { hostContext: {} } },
    }),
  );
  await Promise.resolve();
  expect(window.parent.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'ui/notifications/size-changed',
      params: { height: 800 },
    }),
    '*',
  );
  bounds.mockReturnValue({ height: 200 } as DOMRect);
  result('get_posts', []);
  expect(window.parent.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'ui/notifications/size-changed',
      params: { height: 200 },
    }),
    '*',
  );
});

it('renders the content calendar with gap days and draft counts', () => {
  result('get_posts', {
    days: 2,
    draftsCount: 1,
    gapDays: ['2026-10-05'],
    scheduled: [
      {
        description: '<b>Launch</b>',
        id: 'p1',
        platform: 'instagram',
        scheduledDate: '2026-10-04T09:00:00.000Z',
      },
    ],
  });

  expect(document.getElementById('cards')?.classList.contains('calendar')).toBe(
    true,
  );
  const days = document.querySelectorAll('section.day');
  expect(days).toHaveLength(2);
  expect(days[0]?.querySelector('.slot p')?.textContent).toBe('<b>Launch</b>');
  expect(days[0]?.querySelector('b')).toBeNull();
  expect(days[1]?.classList.contains('gap')).toBe(true);
  expect(days[1]?.textContent).toContain('Nothing scheduled');
  expect(document.getElementById('summary')?.textContent).toContain(
    '1 scheduled',
  );
  expect(document.getElementById('summary')?.textContent).toContain('1 draft');
});

it('renders posts as a social preview with platform, status and media', () => {
  result('get_posts', {
    posts: [
      {
        description: 'Hello world',
        id: 'p1',
        platform: 'linkedin',
        status: 'scheduled',
        thumbnailUrl: 'https://cdn.genfeed.ai/post.png',
        url: 'https://cdn.genfeed.ai/post.png',
      },
    ],
  });

  const post = document.querySelector('article.post');
  expect(post?.querySelector('.avatar')?.textContent).toBe('L');
  expect(post?.querySelector('.who strong')?.textContent).toBe('LinkedIn');
  expect(post?.querySelector('.status')?.textContent).toBe('scheduled');
  expect(post?.querySelector('.description')?.textContent).toBe('Hello world');
});

it('opens images in a lightbox and closes it with Escape', async () => {
  result('list_assets', [
    {
      category: 'IMAGE',
      id: 'img',
      label: 'Hero',
      url: 'https://cdn.genfeed.ai/hero.png',
    },
  ]);
  const zoom = document.querySelector<HTMLElement>('button.zoom');
  zoom?.click();
  await vi.advanceTimersByTimeAsync(0);

  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.getAttribute('aria-modal')).toBe('true');
  expect(dialog?.querySelector('img')?.getAttribute('src')).toBe(
    'https://cdn.genfeed.ai/hero.png',
  );
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await vi.advanceTimersByTimeAsync(0);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(zoom);
});

it('polls a pending job through the host and swaps in the finished video', async () => {
  result('generate', {
    category: 'VIDEO',
    id: 'job-1',
    progress: 40,
    status: 'PROCESSING',
  });
  expect(
    document
      .querySelector('[role="progressbar"]')
      ?.getAttribute('aria-valuenow'),
  ).toBe('40');
  expect(document.querySelector('video')).toBeNull();

  await vi.advanceTimersByTimeAsync(5000);
  const call = vi
    .mocked(window.parent.postMessage)
    .mock.calls.map(
      ([data]) => data as { id?: number; method?: string; params?: unknown },
    )
    .find((data) => data.method === 'tools/call');
  expect(call?.params).toEqual({
    arguments: { jobId: 'job-1' },
    name: 'get_job_status',
  });

  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: {
        jsonrpc: '2.0',
        id: call?.id,
        result: {
          structuredContent: {
            genfeedCards: buildCardView('get_job_status', {
              category: 'VIDEO',
              id: 'job-1',
              status: 'COMPLETED',
              thumbnailUrl: 'https://cdn.genfeed.ai/poster.jpg',
              url: 'https://cdn.genfeed.ai/video.mp4',
            }),
          },
        },
      },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();

  const video = document.querySelector('video');
  expect(video?.getAttribute('src')).toBe('https://cdn.genfeed.ai/video.mp4');
  expect(video?.poster).toBe('https://cdn.genfeed.ai/poster.jpg');
  expect(video?.preload).toBe('metadata');
  expect(document.querySelector('[role="progressbar"]')).toBeNull();
});

it('declares inline and fullscreen display modes at initialization', () => {
  expect(window.parent.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'ui/initialize',
      params: expect.objectContaining({
        appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
      }),
    }),
    '*',
  );
});

it('stops polling a job once a newer result replaces the view', async () => {
  result('generate', {
    category: 'VIDEO',
    id: 'job-old',
    status: 'PROCESSING',
  });
  await vi.advanceTimersByTimeAsync(5000);
  const calls = () =>
    vi
      .mocked(window.parent.postMessage)
      .mock.calls.map(([data]) => data as { id?: number; method?: string })
      .filter((data) => data.method === 'tools/call');
  const inFlight = calls()[0];
  expect(inFlight).toBeDefined();

  result('get_posts', { posts: [{ id: 'p1', description: 'New view' }] });
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: {
        jsonrpc: '2.0',
        id: inFlight?.id,
        result: {
          structuredContent: {
            genfeedCards: buildCardView('get_job_status', {
              category: 'VIDEO',
              id: 'job-old',
              status: 'PROCESSING',
            }),
          },
        },
      },
    }),
  );
  await vi.advanceTimersByTimeAsync(30000);

  expect(calls()).toHaveLength(1);
  expect(document.querySelector('video')).toBeNull();
  expect(document.querySelector('article.post')).not.toBeNull();
});

it('files calendar posts under the viewer-local day of their time', () => {
  const scheduledDate = '2026-10-04T01:00:00.000Z';
  result('get_posts', {
    days: 2,
    draftsCount: 0,
    gapDays: [],
    scheduled: [{ description: 'Late post', id: 'p1', scheduledDate }],
  });

  const local = new Date(scheduledDate);
  const label = local.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const column = Array.from(document.querySelectorAll('section.day')).find(
    (day) => day.textContent?.includes('Late post'),
  );
  expect(column?.querySelector('h3')?.textContent).toContain(label);
  expect(column?.querySelector('.slot span')?.textContent).toContain(
    local.toLocaleString(undefined, { timeStyle: 'short' }),
  );
});

it('shows post attachments and plays attached media that carries a URL', () => {
  result('get_posts', {
    posts: [
      {
        description: 'Carousel',
        id: 'p1',
        media: [
          { assetId: 'a1', kind: 'image', order: 0 },
          { assetId: 'a2', kind: 'image', order: 1 },
          { assetId: 'a3', kind: 'video', order: 2 },
        ],
        platform: 'instagram',
      },
      {
        description: 'Clip',
        id: 'p2',
        media: [
          {
            assetId: 'v1',
            kind: 'video',
            url: 'https://cdn.genfeed.ai/clip.mp4',
          },
        ],
        platform: 'tiktok',
      },
    ],
  });

  const [carousel, clip] = Array.from(
    document.querySelectorAll('article.post'),
  );
  expect(
    Array.from(carousel?.querySelectorAll('.attachments > span') ?? []).map(
      (pill) => pill.textContent,
    ),
  ).toEqual(['Image ×2', 'Video']);
  expect(clip?.querySelector('video')?.getAttribute('src')).toBe(
    'https://cdn.genfeed.ai/clip.mp4',
  );
});

it('keeps keyboard focus inside the shared dialog and hides the background', async () => {
  result('list_assets', [
    { category: 'IMAGE', id: 'img', url: 'https://cdn.genfeed.ai/hero.png' },
  ]);
  document.querySelector<HTMLElement>('button.zoom')?.click();
  await vi.advanceTimersByTimeAsync(0);
  const close = document.querySelector<HTMLElement>('.lightbox .close');

  expect(
    document.getElementById('cards')?.closest('[aria-hidden="true"]'),
  ).not.toBeNull();
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    }),
  );
  expect(document.activeElement).toBe(close);
  close?.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(
    document.getElementById('cards')?.closest('[aria-hidden="true"]'),
  ).toBeNull();
});

it('says when it stops polling a job that never finishes', async () => {
  result('generate', {
    category: 'VIDEO',
    id: 'job-slow',
    status: 'PROCESSING',
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    await vi.advanceTimersByTimeAsync(5000);
    const call = vi
      .mocked(window.parent.postMessage)
      .mock.calls.map(([data]) => data as { id?: number; method?: string })
      .filter((data) => data.method === 'tools/call')
      .at(-1);
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window.parent,
        data: { jsonrpc: '2.0', id: call?.id, result: {} },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  }
  await vi.advanceTimersByTimeAsync(5000);

  expect(document.querySelector('.pending .notice')?.textContent).toBe(
    'Still generating. Ask for the job status again to see the result.',
  );
  expect(document.querySelector('.bar.indeterminate')).toBeNull();
});

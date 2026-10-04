// @vitest-environment jsdom
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
  expect(document.querySelector('h2')?.textContent).toContain('<img');
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
  expect(document.querySelector('video')?.controls).toBe(true);
  expect(document.querySelector('video')?.autoplay).toBe(false);
  result('list_assets', [
    { id: 'audio', category: 'MUSIC', url: 'https://cdn.genfeed.ai/music.mp3' },
  ]);
  expect(document.querySelector('audio')?.controls).toBe(true);
});

it('uses open-link for external media without loading unapproved origins', () => {
  result('list_assets', [
    { category: 'IMAGE', url: 'https://external.example/image.png' },
  ]);
  expect(document.querySelector('img')).toBeNull();
  document.querySelector('a')?.click();
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
  expect(document.querySelector('summary')?.textContent).toBe('Read more');
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

  expect(document.getElementById('cards')?.className).toBe('calendar');
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
  expect(post?.querySelector('.who strong')?.textContent).toBe('Linkedin');
  expect(post?.querySelector('.status')?.textContent).toBe('scheduled');
  expect(post?.querySelector('.description')?.textContent).toBe('Hello world');
});

it('opens images in a lightbox and closes it with Escape', () => {
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

  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.getAttribute('aria-modal')).toBe('true');
  expect(dialog?.querySelector('img')?.getAttribute('src')).toBe(
    'https://cdn.genfeed.ai/hero.png',
  );
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
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

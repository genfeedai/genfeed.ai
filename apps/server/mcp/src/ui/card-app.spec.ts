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
      genfeedCards: buildCardView('list_posts', {
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
  result('list_images', [
    { id: 'img', url: 'https://cdn.genfeed.ai/image.png' },
  ]);
  expect(document.querySelector('img')?.getAttribute('src')).toBe(
    'https://cdn.genfeed.ai/image.png',
  );
  result('list_videos', [
    { id: 'vid', url: 'https://cdn.genfeed.ai/video.mp4', status: 'COMPLETED' },
  ]);
  expect(document.querySelector('video')?.controls).toBe(true);
  expect(document.querySelector('video')?.autoplay).toBe(false);
  result('list_music', [
    { id: 'audio', url: 'https://cdn.genfeed.ai/music.mp3' },
  ]);
  expect(document.querySelector('audio')?.controls).toBe(true);
});

it('uses open-link for external media without loading unapproved origins', () => {
  result('list_images', [{ url: 'https://external.example/image.png' }]);
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
  result('list_posts', { posts: [{ id: 'p1', label: 'Post' }] });
  result('list_posts', { posts: [] });
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
  result('get_article', { title: 'Article', content: 'a'.repeat(900) });
  expect(document.querySelector('summary')?.textContent).toBe('Read more');
  result('get_usage_stats', { contentCreated: { images: 0 } });
  expect(document.querySelector('.metric')?.textContent).toBe('0');
  result(
    'list_images',
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
  result('list_avatars', [
    { name: 'Avatar', thumbnailUrl: 'https://cdn.genfeed.ai/avatar.png' },
  ]);
  expect(document.querySelector('img')?.getAttribute('src')).toBe(
    'https://cdn.genfeed.ai/avatar.png',
  );
  expect(document.querySelector('a')?.href).toBe(
    'https://cdn.genfeed.ai/avatar.png',
  );
});

it('reports host open-link failures returned as results', async () => {
  result('list_images', [{ url: 'https://external.example/image.png' }]);
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
  result('list_posts', []);
  expect(window.parent.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'ui/notifications/size-changed',
      params: { height: 200 },
    }),
    '*',
  );
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('~platforms/source-capture-extract', () => ({
  extractSourceCapture: mocks.extract,
}));
vi.mock('~platforms/ui-helpers', () => ({
  icons: {
    bookmark: '<svg>b</svg>',
    check: '<svg>c</svg>',
    spinner: '<svg>s</svg>',
    x: '<svg>x</svg>',
  },
}));
vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import type { PlatformConfig } from '../src/platforms/config';
import {
  attachSourceButton,
  attachSourceMenuItem,
  captureXPostImage,
  copyImageToClipboard,
  createImageSourceActions,
  describeSaveOutcome,
  isSourcePage,
  savePageSource,
} from '../src/platforms/source-capture-control';

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

function platform(name: string, actions = '#actions'): PlatformConfig {
  return {
    constructPostUrl: () => 'https://x.com/a/status/1',
    extractPostId: () => '1',
    hostnames: [],
    name,
    platform: name as PlatformConfig['platform'],
    selectors: {
      actionsContainer: actions,
      postContainer: 'article',
      postIdentifier: 'article',
      replyTextarea: 'textarea',
    },
  };
}

const raw = {
  isSelection: false,
  media: [],
  scope: 'page',
  text: 'Post',
  title: 'Post',
  typeHints: [],
  url: 'https://x.com/a/status/1',
};

beforeEach(() => {
  mocks.extract.mockReset().mockReturnValue(raw);
  mocks.sendMessage.mockReset();
  Object.assign(chrome.runtime, { sendMessage: mocks.sendMessage });
  document.body.innerHTML = '<div id="actions"></div>';
});

afterEach(() => {
  stubLocation('https://example.com/');
  vi.useRealTimers();
});

describe('supported source pages', () => {
  it.each([
    ['https://x.com/author/status/123', true],
    ['https://x.com/home', false],
    ['https://www.reddit.com/r/test/comments/abc123/title/', true],
    ['https://www.reddit.com/r/test/', false],
    ['https://www.youtube.com/watch?v=abc123', true],
    ['https://www.youtube.com/shorts/abcdefg', true],
    ['https://www.youtube.com/', false],
    ['https://example.com/article', false],
  ])('%s -> %s', (href, expected) => {
    stubLocation(href);
    expect(isSourcePage()).toBe(expected);
  });
});

describe('visible Save source action', () => {
  it('adds one labelled button on a supported page and saves only on click', async () => {
    stubLocation('https://x.com/author/status/123');
    mocks.sendMessage.mockResolvedValue({
      data: { deduplicated: false, source: { id: 'csource00000001' } },
      success: true,
    });
    attachSourceButton(platform('twitter'));
    attachSourceButton(platform('twitter'));
    const buttons = document.querySelectorAll('[data-genfeed-source]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Save source for later');
    expect(mocks.sendMessage).not.toHaveBeenCalled();

    (buttons[0] as HTMLButtonElement).click();
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalled());
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      event: 'importedSourceSave',
      raw,
    });
    expect(mocks.extract).toHaveBeenCalledWith({ scope: 'page' });
    await vi.waitFor(() =>
      expect(document.querySelector('.genfeed-toast')?.textContent).toBe(
        'Saved for later. Nothing was generated.',
      ),
    );
  });

  it('does not appear on unsupported networks or pages', () => {
    stubLocation('https://x.com/home');
    attachSourceButton(platform('twitter'));
    stubLocation('https://www.linkedin.com/feed/update/1');
    attachSourceButton(platform('linkedin'));
    expect(document.querySelector('[data-genfeed-source]')).toBeNull();
  });

  it('adds the menu item once and reports the outcome in it', async () => {
    stubLocation('https://x.com/author/status/123');
    const dropdown = document.createElement('div');
    dropdown.innerHTML = '<div class="genfeed-dropdown-menu"></div>';
    mocks.sendMessage.mockResolvedValue({
      data: { deduplicated: true, source: { id: 'csource00000001' } },
      success: true,
    });
    attachSourceMenuItem({ dropdown, platform: platform('twitter') });
    attachSourceMenuItem({ dropdown, platform: platform('twitter') });
    const items = dropdown.querySelectorAll('[data-genfeed-source-menu]');
    expect(items).toHaveLength(1);
    (items[0] as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(items[0].textContent).toBe(
        'Already saved. Nothing was changed or generated.',
      ),
    );
  });

  it('shows the honest limitation when the page cannot be captured', async () => {
    mocks.extract.mockImplementation(() => {
      throw new Error(
        'This page exceeds the capture limit. Select a shorter passage.',
      );
    });
    await expect(savePageSource()).resolves.toEqual({
      isError: true,
      message: 'This page exceeds the capture limit. Select a shorter passage.',
    });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe('save outcomes', () => {
  it('distinguishes new, existing, deleted and failed saves', () => {
    expect(
      describeSaveOutcome({
        data: { deduplicated: false, source: {} as never },
        success: true,
      }),
    ).toEqual({
      isError: false,
      message: 'Saved for later. Nothing was generated.',
    });
    expect(
      describeSaveOutcome({ code: 'IMPORTED_SOURCE_DELETED', success: false }),
    ).toEqual({
      isError: true,
      message: 'Deleted earlier. Open the Genfeed panel to save it again.',
    });
    expect(
      describeSaveOutcome({ error: 'Select a brand', success: false }),
    ).toEqual({
      isError: true,
      message: 'Select a brand',
    });
    expect(describeSaveOutcome(undefined).isError).toBe(true);
  });
});

describe('image actions', () => {
  function feedImage(): HTMLImageElement {
    document.body.innerHTML = `<article data-testid="tweet"><div data-testid="User-Name"><a href="/author">Author Name</a></div><div data-testid="tweetText">A launch photo</div><a href="https://x.com/author/status/987"><time>1h</time></a><img id="photo" alt="Launch" src="https://pbs.twimg.com/media/photo.jpg"></article>`;
    return document.querySelector('#photo') as HTMLImageElement;
  }

  it('captures the post an image belongs to, with the image as the chosen media', () => {
    expect(captureXPostImage(feedImage())).toMatchObject({
      authorHandle: 'author',
      canonicalUrl: 'https://x.com/author/status/987',
      externalIdentity: '987',
      host: 'x',
      media: [
        {
          kind: 'image',
          origin: 'selected',
          url: 'https://pbs.twimg.com/media/photo.jpg',
        },
      ],
      scope: 'media',
      text: 'A launch photo',
    });
  });

  it('does not capture an image outside a post', () => {
    document.body.innerHTML =
      '<img id="loose" src="https://pbs.twimg.com/a.jpg">';
    expect(
      captureXPostImage(document.querySelector('#loose') as HTMLImageElement),
    ).toBeNull();
  });

  it('copies the image bytes and saves nothing', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write },
    });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: async () => new Blob(['png'], { type: 'image/png' }),
        ok: true,
      }),
    );
    await copyImageToClipboard('https://pbs.twimg.com/media/photo.jpg');
    expect(write).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('says plainly when the site does not allow copying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')));
    const [copy] = createImageSourceActions(feedImage());
    copy.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.genfeed-toast')?.textContent).toMatch(
        /does not allow copying/,
      ),
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('saves the image source only when its button is clicked', async () => {
    mocks.sendMessage.mockResolvedValue({
      data: { deduplicated: false, source: { id: 'csource00000001' } },
      success: true,
    });
    const image = feedImage();
    const [, save] = createImageSourceActions(image);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    save.click();
    await vi.waitFor(() => expect(mocks.sendMessage).toHaveBeenCalled());
    expect(mocks.sendMessage.mock.calls[0][0]).toMatchObject({
      event: 'importedSourceSave',
      raw: { externalIdentity: '987', scope: 'media' },
    });
  });
});

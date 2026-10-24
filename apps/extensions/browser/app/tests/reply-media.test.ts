import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateComposer: vi.fn(),
  attach: vi.fn(),
  insert: vi.fn(),
  markWritten: vi.fn(),
}));

vi.mock('~platforms/composer-helpers', () => ({
  activateComposer: mocks.activateComposer,
  insertContentIntoComposer: mocks.insert,
  markWrittenByGenfeed: mocks.markWritten,
}));
vi.mock('~platforms/media-attach', () => ({
  attachMediaToComposer: mocks.attach,
}));
vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

import { platforms } from '~platforms/config';
import { runReplyWithMedia } from '~platforms/reply-media';
import { currentToastText } from '~platforms/ui/toast';
import type { MenuItemControls } from '~types/genfeed-menu';

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

function controls(): MenuItemControls {
  return { reset: vi.fn(), setStatus: vi.fn() };
}

function reply(extra: Record<string, unknown> = {}) {
  vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
    mediaDataUrl: DATA_URL,
    reply: 'Great launch!',
    success: true,
    ...extra,
  } as never);
}

describe('runReplyWithMedia', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-testid="User-Name"><a>Ada Lovelace</a></div>
      <div data-testid="tweetText">We just launched our public API.</div>`;
    vi.clearAllMocks();
    mocks.activateComposer.mockResolvedValue(true);
    mocks.insert.mockReturnValue({ success: true });
    mocks.attach.mockResolvedValue('attached');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: async () => new Blob(['x']) }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:genfeed');
    vi.spyOn(window, 'open').mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('writes the reply, attaches the image and tells the user to review it', async () => {
    reply();
    const row = controls();

    await runReplyWithMedia('image', {
      controls: row,
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'generateReplyWithMedia',
        mediaType: 'image',
        platform: 'twitter',
        postAuthor: 'Ada Lovelace',
        postContent: 'We just launched our public API.',
      }),
    );
    expect(mocks.insert).toHaveBeenCalledWith(
      'Great launch!',
      platforms.twitter,
    );
    expect(mocks.markWritten).toHaveBeenCalledWith('Great launch!');
    expect(mocks.attach).toHaveBeenCalledWith(
      platforms.twitter,
      DATA_URL,
      'genfeed-image.png',
    );
    expect(row.setStatus).toHaveBeenLastCalledWith('done', 'Ready!');
    expect(currentToastText()).toBe('Reply and image ready! Review and post.');
  });

  it('asks for a five second video and attaches an mp4', async () => {
    reply();

    await runReplyWithMedia('video', {
      controls: controls(),
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 5, event: 'generateReplyWithVideo' }),
    );
    expect(mocks.attach).toHaveBeenCalledWith(
      platforms.twitter,
      DATA_URL,
      'genfeed-video.mp4',
    );
  });

  it('asks for a reaction image for a GIF, based on the post', async () => {
    reply();

    await runReplyWithMedia('gif', {
      controls: controls(),
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePrompt: expect.stringContaining(
          'We just launched our public API.',
        ),
        mediaType: 'gif',
      }),
    );
  });

  it('reports a failed generation and writes nothing', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      error: 'No credits left',
      success: false,
    } as never);
    const row = controls();

    await runReplyWithMedia('image', {
      controls: row,
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(row.setStatus).toHaveBeenLastCalledWith('error', 'Failed');
    expect(currentToastText()).toBe('No credits left');
  });

  it('opens the file in a tab when the page cannot take it', async () => {
    reply();
    mocks.attach.mockResolvedValue('unsupported');
    const row = controls();

    await runReplyWithMedia('image', {
      controls: row,
      platform: platforms.youtube,
      platformName: 'youtube',
    });

    expect(window.open).toHaveBeenCalledWith('blob:genfeed', '_blank');
    expect(currentToastText()).toContain('opened in a new tab');
    expect(row.setStatus).toHaveBeenLastCalledWith('done', 'Reply ready');
  });

  it('keeps the reply and opens the file when the reply box is missing', async () => {
    reply();
    mocks.insert.mockReturnValue({
      error: 'Compose box not found.',
      success: false,
    });

    await runReplyWithMedia('image', {
      controls: controls(),
      platform: platforms.reddit,
      platformName: 'reddit',
    });

    expect(mocks.markWritten).not.toHaveBeenCalled();
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(window.open).toHaveBeenCalledWith('blob:genfeed', '_blank');
    expect(currentToastText()).toBe('Compose box not found.');
  });

  it('reports a missing reply box when there is no media and keeps the text', async () => {
    reply({ mediaDataUrl: undefined, videoUrl: 'https://cdn.example/v.mp4' });
    mocks.insert.mockReturnValue({
      error: 'Compose box not found.',
      success: false,
    });
    const row = controls();

    await runReplyWithMedia('video', {
      controls: row,
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(window.open).toHaveBeenCalledWith(
      'https://cdn.example/v.mp4',
      '_blank',
    );
    expect(currentToastText()).toContain('Compose box not found.');
    expect(currentToastText()).toContain('Great launch!');
    expect(row.setStatus).toHaveBeenLastCalledWith(
      'error',
      'Reply not inserted',
    );
  });

  it('opens the generated video link when the media came as a URL only', async () => {
    reply({ mediaDataUrl: undefined, videoUrl: 'https://cdn.example/v.mp4' });

    await runReplyWithMedia('video', {
      controls: controls(),
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(window.open).toHaveBeenCalledWith(
      'https://cdn.example/v.mp4',
      '_blank',
    );
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it('opens a collapsed reply box before writing into it', async () => {
    reply();

    await runReplyWithMedia('image', {
      controls: controls(),
      platform: platforms.youtube,
      platformName: 'youtube',
    });

    expect(mocks.activateComposer).toHaveBeenCalledWith(platforms.youtube);
    expect(mocks.activateComposer.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insert.mock.invocationCallOrder[0],
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replyWithMedia: vi.fn(),
  runPageTextAction: vi.fn(),
  sourceItem: vi.fn(),
}));

vi.mock('~platforms/reply-media', () => ({
  runReplyWithMedia: mocks.replyWithMedia,
}));
vi.mock('~platforms/text-action-flow', () => ({
  runPageTextAction: mocks.runPageTextAction,
}));
vi.mock('~platforms/source-capture-control', () => ({
  createSourceMenuItem: mocks.sourceItem,
}));
vi.mock('~utils/logger.util', () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
}));

import { platforms } from '~platforms/config';
import { buildMenuGroups } from '~platforms/menu-actions';
import { currentToastText } from '~platforms/ui/toast';
import type { MenuItemControls, MenuItemSpec } from '~types/genfeed-menu';

function controls(): MenuItemControls {
  return { reset: vi.fn(), setStatus: vi.fn() };
}

function build(platformKey = 'twitter'): MenuItemSpec[] {
  return buildMenuGroups({
    platform: platforms[platformKey],
    platformName: platformKey,
    postUrl: 'https://x.com/author/status/123',
  }).flatMap((group) => group.items);
}

function find(id: string, platformKey?: string): MenuItemSpec {
  const found = build(platformKey).find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`No menu item ${id}`);
  }
  return found;
}

describe('buildMenuGroups', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-testid="User-Name"><a>Ada Lovelace</a></div>
      <div data-testid="tweetText">We just launched our public API.</div>`;
    vi.clearAllMocks();
    mocks.sourceItem.mockReturnValue(null);
  });

  it('groups the actions by what they do to the reply box', () => {
    const groups = buildMenuGroups({
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(
      groups.map((group) => [group.label, group.items.map((i) => i.label)]),
    ).toEqual([
      ['Write', ['Generate reply', 'Proofread', 'Rewrite in my voice']],
      ['Generate', ['Image', 'Video', 'GIF']],
      [undefined, ['Attach from Library']],
    ]);
  });

  it('puts Image, Video and GIF under one collapsible Generate group', () => {
    const groups = buildMenuGroups({
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(groups.find((group) => group.id === 'generate')?.isCollapsible).toBe(
      true,
    );
    expect(
      groups.flatMap((group) => group.items).map((entry) => entry.id),
    ).not.toContain('generate-image');
  });

  it('offers the draft actions and the Library in a new-post composer with no post open', () => {
    const groups = buildMenuGroups({
      hasPost: false,
      platform: platforms.twitter,
      platformName: 'twitter',
    });

    expect(
      groups.map((group) => [group.label, group.items.map((i) => i.label)]),
    ).toEqual([
      ['Write', ['Proofread', 'Rewrite in my voice']],
      [undefined, ['Attach from Library']],
    ]);
  });

  it('offers the Library only where the reply box takes files', () => {
    expect(find('attach-from-library').isAvailable?.()).toBe(true);
    expect(find('attach-from-library', 'linkedin').isAvailable?.()).toBe(
      Boolean(platforms.linkedin.mediaReply),
    );
  });

  it('keeps a full accessible name on each media row', () => {
    expect(
      ['reply-with-image', 'reply-with-video', 'reply-with-gif'].map(
        (id) => find(id).ariaLabel,
      ),
    ).toEqual(['Reply with Image', 'Reply with Video', 'Reply with GIF']);
  });

  it('adds Save source for later when the platform can save one', () => {
    mocks.sourceItem.mockReturnValue({
      icon: '',
      id: 'save-source',
      label: 'Save source for later',
      run: vi.fn(),
    });

    expect(build().map((entry) => entry.label)).toContain(
      'Save source for later',
    );
  });

  it('opens a brand-aware reply composer with the post and its author', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      success: true,
    } as never);

    await find('generate-reply').run(controls());

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      event: 'SHORTCUT_REPLY',
      payload: {
        author: 'Ada Lovelace',
        content: 'We just launched our public API.',
        platform: 'twitter',
        url: 'https://x.com/author/status/123',
      },
    });
  });

  it('says so when the reply composer could not be opened', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      error: 'Sign in first',
      success: false,
    } as never);

    await find('generate-reply').run(controls());

    expect(currentToastText()).toBe('Sign in first');
  });

  it.each([
    ['proofread', 'proofread'],
    ['rewrite', 'rewrite'],
  ])('%s runs the page text action and restores the row', async (id, mode) => {
    mocks.runPageTextAction.mockResolvedValue(undefined);
    const row = controls();

    await find(id).run(row);

    expect(mocks.runPageTextAction).toHaveBeenCalledWith(
      mode,
      expect.objectContaining({ markWritten: expect.any(Function) }),
    );
    expect(row.reset).toHaveBeenCalled();
  });

  it.each(['image', 'video', 'gif'])(
    'reply with %s hands off to the shared media action',
    async (kind) => {
      const row = controls();

      await find(`reply-with-${kind}`).run(row);

      expect(mocks.replyWithMedia).toHaveBeenCalledWith(kind, {
        controls: row,
        platform: platforms.twitter,
        platformName: 'twitter',
      });
    },
  );
});

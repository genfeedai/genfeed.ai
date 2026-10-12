// @vitest-environment-options {"url":"https://www.linkedin.com/feed/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PLATFORM = {
  constructPostUrl: () => '',
  extractPostId: () => null,
  hostnames: [],
  name: 'LinkedIn',
  platform: 'linkedin',
  selectors: {
    actionsContainer: '[role="group"]',
    postContainer: 'article',
    postIdentifier: 'article',
    replyTextarea: '#composer',
  },
};

vi.mock('~platforms/config', () => ({
  getCurrentPlatform: () => PLATFORM,
  getPlatformName: () => 'linkedin',
}));
vi.mock('~platforms/source-capture-control', () => ({
  attachSourceButton: vi.fn(),
  attachSourceMenuItem: vi.fn(),
  createImageSourceActions: vi.fn(() => []),
}));
vi.mock('~platforms/ui-helpers', () => ({
  createButtonContainer: vi.fn(),
  createGenFeedDropdown: vi.fn(),
  injectGlobalStyles: vi.fn(),
  watchContentTheme: vi.fn(),
}));
vi.mock('~services/error-tracking.service', () => ({
  initializeErrorTracking: vi.fn(),
}));

type Handler = (
  message: Record<string, unknown>,
  sender: object,
  respond: (response: unknown) => void,
) => boolean | undefined;

let handler: Handler;

function ask(message: Record<string, unknown>): unknown {
  const respond = vi.fn();
  expect(handler(message, {}, respond)).toBe(true);
  expect(respond).toHaveBeenCalledOnce();
  return respond.mock.calls[0][0];
}

function composer(): HTMLTextAreaElement {
  return document.getElementById('composer') as HTMLTextAreaElement;
}

describe('content script text actions for the side panel', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML =
      '<textarea id="composer">Teh launch is live</textarea>';
    vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
    vi.mocked(chrome.runtime.sendMessage).mockReset();
    await import('../src/content');
    handler = vi.mocked(chrome.runtime.onMessage.addListener).mock
      .calls[0][0] as Handler;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('captures the composer text and answers with an id, not the element', () => {
    expect(ask({ type: 'CAPTURE_COMPOSER_TEXT' })).toEqual({
      scope: 'draft',
      snapshotId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      success: true,
      text: 'Teh launch is live',
    });
    expect(composer().value).toBe('Teh launch is live');
  });

  it('applies the suggestion once by id, tells the background and can undo it', () => {
    const { snapshotId } = ask({ type: 'CAPTURE_COMPOSER_TEXT' }) as {
      snapshotId: string;
    };

    expect(
      ask({
        snapshotId,
        text: 'The launch is live',
        type: 'APPLY_COMPOSER_TEXT',
      }),
    ).toEqual({ success: true });
    expect(composer().value).toBe('The launch is live');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      payload: { content: 'The launch is live', success: true },
      type: 'CONTENT_INSERTED',
    });

    expect(ask({ snapshotId, type: 'UNDO_COMPOSER_TEXT' })).toEqual({
      success: true,
    });
    expect(composer().value).toBe('Teh launch is live');
  });

  it('refuses to apply over an edited draft', () => {
    const { snapshotId } = ask({ type: 'CAPTURE_COMPOSER_TEXT' }) as {
      snapshotId: string;
    };
    composer().value = 'Something else entirely';

    expect(
      ask({
        snapshotId,
        text: 'The launch is live',
        type: 'APPLY_COMPOSER_TEXT',
      }),
    ).toEqual({
      error: 'Your draft changed since the preview. Run the action again.',
      success: false,
    });
    expect(composer().value).toBe('Something else entirely');
  });

  it('rejects an unknown or expired suggestion', () => {
    expect(
      ask({ snapshotId: 'nope', text: 'x', type: 'APPLY_COMPOSER_TEXT' }),
    ).toEqual({
      error: 'This suggestion expired. Run the action again.',
      success: false,
    });
    expect(ask({ snapshotId: 'nope', type: 'UNDO_COMPOSER_TEXT' })).toEqual({
      error: 'This suggestion expired.',
      success: false,
    });
  });

  it('reports a missing composer', () => {
    document.body.innerHTML = '';
    expect(ask({ type: 'CAPTURE_COMPOSER_TEXT' })).toEqual({
      error: 'Open the composer you want to edit first.',
      success: false,
    });
  });

  it('places a chosen reply in the reply box without submitting and tells the background', async () => {
    document.body.innerHTML = `
      <textarea id="composer"></textarea>
      <button id="submit" type="submit">Post</button>`;
    const submit = vi.fn();
    document.getElementById('submit')?.addEventListener('click', submit);
    const respond = vi.fn();

    expect(
      handler(
        { content: 'A chosen reply', type: 'INSERT_CONTENT' },
        {},
        respond,
      ),
    ).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());

    expect(respond).toHaveBeenCalledWith({ success: true });
    expect(composer().value).toBe('A chosen reply');
    expect(submit).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      payload: {
        content: 'A chosen reply',
        error: undefined,
        success: true,
      },
      type: 'CONTENT_INSERTED',
    });
  });

  it('explains a missing reply box instead of pretending to insert', async () => {
    document.body.innerHTML = '';
    const respond = vi.fn();

    handler({ content: 'A chosen reply', type: 'INSERT_CONTENT' }, {}, respond);
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());

    expect(respond.mock.calls[0][0]).toMatchObject({ success: false });
    expect(respond.mock.calls[0][0].error).toContain(
      'Click Reply on the post first',
    );
  });

  it('sends the post, its author and the platform with the reply shortcut', () => {
    document.body.innerHTML = `
      <article>
        <div class="update-components-text">We just launched.</div>
        <div class="update-components-actor__name">Ada</div>
      </article>`;

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', metaKey: true, shiftKey: true }),
    );

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      event: 'SHORTCUT_REPLY',
      payload: {
        author: 'Ada',
        content: 'We just launched.',
        platform: 'linkedin',
        url: 'https://www.linkedin.com/feed/',
      },
    });
  });
});

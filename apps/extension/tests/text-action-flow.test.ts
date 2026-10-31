import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: null as unknown,
}));
vi.mock('~platforms/config', () => ({
  getCurrentPlatform: () => mocks.platform,
  getPlatformName: () => 'twitter',
}));

import { runPageTextAction } from '~platforms/text-action-flow';

const PLATFORM = {
  name: 'Twitter/X',
  platform: 'twitter',
  selectors: { replyTextarea: '#composer' },
};

const RESULT = {
  hasBrandVoice: true,
  isReplayed: false,
  maxCharacters: 280,
  mode: 'rewrite',
  platform: 'twitter',
  text: 'The launch is live',
};

function composer(): HTMLTextAreaElement {
  return document.getElementById('composer') as HTMLTextAreaElement;
}

function preview(): ShadowRoot {
  const host = document.getElementById('genfeed-text-action-preview');
  if (!host?.shadowRoot) throw new Error('No preview');
  return host.shadowRoot;
}

function press(label: string): void {
  Array.from(preview().querySelectorAll('button'))
    .find((button) => button.textContent === label)
    ?.click();
}

describe('page text action flow', () => {
  const hooks = { markWritten: vi.fn(), notify: vi.fn() };

  beforeEach(() => {
    mocks.platform = PLATFORM;
    document.body.innerHTML =
      '<textarea id="composer">Teh launch is live</textarea>';
    vi.mocked(chrome.runtime.sendMessage).mockReset();
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      result: RESULT,
      success: true,
    } as never);
    hooks.markWritten.mockReset();
    hooks.notify.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sends the draft with a request key and previews without touching the composer', async () => {
    await runPageTextAction('rewrite', hooks);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({
      event: 'refineText',
      mode: 'rewrite',
      platform: 'twitter',
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      text: 'Teh launch is live',
    });
    expect(hooks.notify).toHaveBeenCalledWith('Rewriting in your voice…');
    expect(preview().querySelector('.text')?.textContent).toBe(
      'The launch is live',
    );
    expect(composer().value).toBe('Teh launch is live');
  });

  it('replaces the composer text only on Apply and restores it on Undo', async () => {
    await runPageTextAction('rewrite', hooks);

    press('Apply');
    expect(composer().value).toBe('The launch is live');
    expect(hooks.markWritten).toHaveBeenCalledExactlyOnceWith(
      'The launch is live',
    );

    press('Undo');
    expect(composer().value).toBe('Teh launch is live');
    expect(hooks.markWritten).toHaveBeenCalledOnce();
  });

  it('replaces only the selection and leaves the rest', async () => {
    composer().value = 'Intro. Teh launch is live. Outro.';
    composer().setSelectionRange(7, 25);

    await runPageTextAction('proofread', hooks);
    expect(
      vi.mocked(chrome.runtime.sendMessage).mock.calls[0][0],
    ).toMatchObject({
      text: 'Teh launch is live',
    });
    press('Apply');

    expect(composer().value).toBe('Intro. The launch is live. Outro.');
  });

  it('never submits anything', async () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="submit">Post</button>',
    );
    const submit = vi.fn();
    document.getElementById('submit')?.addEventListener('click', submit);
    document.addEventListener('submit', submit);

    await runPageTextAction('rewrite', hooks);
    press('Apply');

    expect(submit).not.toHaveBeenCalled();
  });

  it('tells the user when the draft changed before Apply and leaves it alone', async () => {
    await runPageTextAction('rewrite', hooks);
    composer().value = 'Teh launch is live, plus more';

    press('Apply');

    expect(composer().value).toBe('Teh launch is live, plus more');
    expect(preview().querySelector('[role="status"]')?.textContent).toContain(
      'draft changed',
    );
    expect(hooks.markWritten).not.toHaveBeenCalled();
  });

  it('reports a failed action and shows no preview', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      error: 'Not enough credits to generate content.',
      success: false,
    } as never);

    await runPageTextAction('rewrite', hooks);

    expect(hooks.notify).toHaveBeenLastCalledWith(
      'Not enough credits to generate content.',
      true,
    );
    expect(document.getElementById('genfeed-text-action-preview')).toBeNull();
    expect(composer().value).toBe('Teh launch is live');
  });

  it('reports an unreachable extension', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('gone'));

    await runPageTextAction('proofread', hooks);

    expect(hooks.notify).toHaveBeenLastCalledWith(
      'Could not reach Genfeed. Reload the page and try again.',
      true,
    );
  });

  it('asks for text before calling the background', async () => {
    composer().value = '   ';

    await runPageTextAction('rewrite', hooks);

    expect(hooks.notify).toHaveBeenCalledWith(
      'Write or select some text first.',
      true,
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing on an unsupported page', async () => {
    mocks.platform = null;

    await runPageTextAction('rewrite', hooks);

    expect(hooks.notify).toHaveBeenCalledWith(
      'Text actions are not available on this page.',
      true,
    );
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('shows a notice when a local provider wrote the suggestion', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      result: RESULT,
      routing: {
        hasBrandVoice: true,
        notice:
          'Genfeed reached its request limit, so this was written locally with Claude Code.',
        providerId: 'claude-cli',
        providerLabel: 'Claude Code',
        reason: 'quota_exceeded',
        voiceSource: 'live',
      },
      success: true,
    } as never);

    await runPageTextAction('rewrite', hooks);

    expect(preview().querySelector('.hint')?.textContent).toContain(
      'written locally with Claude Code',
    );
  });

  it('keeps the draft, offers Retry and Provider settings, and retries with the same key', async () => {
    const recovery = {
      canOpenProviderSettings: true,
      canRetry: true,
      kind: 'host_unreachable',
      retryTarget: 'local',
    };
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValueOnce({
      error: 'The Genfeed local bridge is not reachable.',
      recovery,
      success: false,
    } as never);

    await runPageTextAction('rewrite', hooks);

    expect(preview().querySelector('.error')?.textContent).toBe(
      'The Genfeed local bridge is not reachable.',
    );
    expect(composer().value).toBe('Teh launch is live');
    expect(hooks.notify).not.toHaveBeenCalledWith(
      'The Genfeed local bridge is not reachable.',
      true,
    );
    const firstKey = (
      vi.mocked(chrome.runtime.sendMessage).mock.calls[0][0] as unknown as {
        requestKey: string;
      }
    ).requestKey;

    press('Provider settings');
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
      event: 'openProviderSettings',
    });

    press('Retry with local provider');
    await vi.waitFor(() =>
      expect(preview().querySelector('.text')?.textContent).toBe(
        'The launch is live',
      ),
    );
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
      event: 'refineText',
      mode: 'rewrite',
      platform: 'twitter',
      requestKey: firstKey,
      retry: true,
      text: 'Teh launch is live',
    });
  });

  it('only notifies for an ordinary error', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
      error: 'Not enough credits.',
      success: false,
    } as never);

    await runPageTextAction('rewrite', hooks);

    expect(hooks.notify).toHaveBeenLastCalledWith('Not enough credits.', true);
    expect(document.getElementById('genfeed-text-action-preview')).toBeNull();
  });
});

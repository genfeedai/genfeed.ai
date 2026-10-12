import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplyPage } from '~components/pages/ReplyPage';
import { usePlatformStore } from '~store/use-platform-store';

const RESULT = {
  hasBrandVoice: true,
  isReplayed: false,
  maxCharacters: 280,
  platform: 'twitter',
  tone: 'add-value',
  variants: ['Great launch, congrats!', 'How does it handle rate limits?'],
};

const send = vi.mocked(chrome.runtime.sendMessage);

function reply(response: unknown): void {
  send.mockImplementation((async (message: { event: string }) => {
    if (message.event === 'generateReplyVariants') return response;
    return { success: true };
  }) as never);
}

function generateRequest(): Record<string, unknown> {
  const call = send.mock.calls.find(
    ([message]) =>
      (message as { event?: string }).event === 'generateReplyVariants',
  );
  if (!call) throw new Error('No generateReplyVariants request was sent');
  return call[0] as Record<string, unknown>;
}

describe('ReplyPage', () => {
  beforeEach(() => {
    usePlatformStore.setState({ currentPlatform: null });
    send.mockReset();
    reply({ result: RESULT, success: true });
  });

  afterEach(cleanup);

  function renderPage(props: Parameters<typeof ReplyPage>[0] = {}) {
    return render(
      <ReplyPage
        initialAuthor="@ada"
        initialContent="We just launched our public API."
        initialPlatform="twitter"
        initialUrl="https://x.com/ada/status/1"
        {...props}
      />,
    );
  }

  it('asks for tone variants with the real post, author and platform', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Challenge/ }));
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));

    await screen.findByText('Great launch, congrats!');
    expect(generateRequest()).toEqual({
      event: 'generateReplyVariants',
      platform: 'twitter',
      postAuthor: '@ada',
      postContent: 'We just launched our public API.',
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      tone: 'challenge',
    });
  });

  it('marks the chosen tone and defaults to adding value', async () => {
    renderPage();

    expect(
      screen
        .getByRole('button', { name: /Add Value/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: /Funny/ })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: /Funny/ }));
    expect(
      screen
        .getByRole('button', { name: /Funny/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('lists every variant with its length against the platform limit', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));

    await screen.findByText('Great launch, congrats!');
    expect(screen.getByText('How does it handle rate limits?')).toBeTruthy();
    expect(screen.getByText('23/280')).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: 'Insert in reply box' }),
    ).toHaveLength(2);
  });

  it('inserts the chosen variant into the page reply box and nothing else', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));
    await screen.findByText('How does it handle rate limits?');

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Insert in reply box' })[1],
    );

    await screen.findByText('Added to the reply box');
    expect(send).toHaveBeenCalledWith({
      event: 'RELAY_TO_CONTENT',
      payload: {
        content: 'How does it handle rate limits?',
        platform: 'twitter',
        type: 'INSERT_CONTENT',
      },
    });
    const events = send.mock.calls.map(
      ([message]) => (message as { event?: string }).event,
    );
    expect(events).toEqual(['generateReplyVariants', 'RELAY_TO_CONTENT']);
  });

  it('says why a reply could not be inserted and still offers Copy', async () => {
    send.mockImplementation((async (message: { event: string }) =>
      message.event === 'generateReplyVariants'
        ? { result: RESULT, success: true }
        : {
            error: 'Compose box not found on the active page.',
            success: false,
          }) as never);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));
    await screen.findByText('Great launch, congrats!');

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Insert in reply box' })[0],
    );

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Compose box not found on the active page.',
    );
    expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(2);
  });

  it('copies a variant', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));
    await screen.findByText('Great launch, congrats!');

    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Great launch, congrats!'),
    );
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('shows the voice hint when the brand has no approved voice', async () => {
    reply({
      result: {
        ...RESULT,
        hasBrandVoice: false,
        voiceHint: 'Set up and approve your brand voice in Genfeed.',
      },
      success: true,
    });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));

    expect(
      await screen.findByText(
        'Set up and approve your brand voice in Genfeed.',
      ),
    ).toBeTruthy();
  });

  it('reads the platform from the source URL, then from the open page', async () => {
    renderPage({
      initialPlatform: undefined,
      initialUrl: 'https://www.reddit.com/r/a/comments/abc/title/',
    });
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));
    await screen.findByText('Great launch, congrats!');
    expect(generateRequest().platform).toBe('reddit');

    cleanup();
    send.mockClear();
    usePlatformStore.setState({ currentPlatform: 'linkedin' });
    renderPage({ initialPlatform: undefined, initialUrl: '' });
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));
    await screen.findByText('Great launch, congrats!');
    expect(generateRequest().platform).toBe('linkedin');
  });

  it('does not guess a platform for an unsupported page', async () => {
    renderPage({
      initialPlatform: undefined,
      initialUrl: 'https://example.com/a',
    });
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Open a post on a supported site to reply to it.',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('returns to the form with the failure the background reported', async () => {
    reply({ error: 'Not enough credits to generate content.', success: false });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Not enough credits to generate content.',
    );
    expect(
      screen.getByRole('button', { name: /Generate replies/ }),
    ).toBeTruthy();
  });

  it('blocks an empty post', () => {
    renderPage({ initialContent: '' });
    expect(
      (
        screen.getByRole('button', {
          name: /Generate replies/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('generates more with a fresh request key', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Generate replies/ }));
    await screen.findByText('Great launch, congrats!');
    const first = generateRequest().requestKey;

    send.mockClear();
    reply({ result: RESULT, success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Generate more' }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(generateRequest().requestKey).not.toBe(first);
  });
});

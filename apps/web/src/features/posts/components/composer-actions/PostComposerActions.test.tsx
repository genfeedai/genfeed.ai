import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostComposerActions from '@/features/posts/components/composer-actions/PostComposerActions';
import type { PostComposerActionsProps } from '@/features/posts/components/composer-actions/PostComposerActions.props';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

function renderActions(overrides: Partial<PostComposerActionsProps> = {}) {
  const props: PostComposerActionsProps = {
    isBusy: false,
    onApplyRewrite: vi.fn(),
    onRewrite: vi.fn().mockResolvedValue('<p>Shorter text</p>'),
    platformLabel: 'TikTok',
    targetContent: '<p>Original text</p>',
    targetLabel: 'Caption',
    ...overrides,
  };
  return { ...render(<PostComposerActions {...props} />), props };
}

async function chooseFromMenu(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Improve' }));
  await userEvent.click(await screen.findByRole('menuitem', { name }));
}

describe('PostComposerActions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('collapses the rewrite presets into one Improve menu', async () => {
    renderActions();

    expect(
      screen.getByRole('region', { name: 'AI actions' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    for (const name of ['Shorten', 'Simplify', 'Boost', 'Hashtags']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('button', { name: 'Improve' }));

    for (const name of [
      'Shorten',
      'Simplify',
      'Boost',
      'Hashtags',
      'Optimize caption',
    ]) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('menuitem', { name: 'Make Thread' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the credit cost, the first comment and @grok out of the row', async () => {
    renderActions({ canDraftThread: true });

    expect(screen.queryByText(/credits? per run/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Improve' }));
    await screen.findByRole('menuitem', { name: 'Shorten' });
    expect(screen.queryByText('Add first comment')).not.toBeInTheDocument();
    expect(screen.queryByText('End with @grok')).not.toBeInTheDocument();
  });

  it('offers the thread draft only when allowed', async () => {
    renderActions({ canDraftThread: true });

    await userEvent.click(screen.getByRole('button', { name: 'Improve' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Make Thread' }),
    ).toBeInTheDocument();
  });

  it('proposes a rewrite as plain text and applies it only on accept', async () => {
    const { props } = renderActions();

    await chooseFromMenu('Shorten');

    // The region exists while the rewrite is pending; wait for the result.
    await screen.findByText('Shorter text');
    const proposal = screen.getByRole('region', { name: 'AI rewrite' });
    expect(props.onRewrite).toHaveBeenCalledWith(
      expect.stringContaining('shorter'),
      'shorten',
      'professional',
    );
    expect(within(proposal).getByText('Shorter text')).toBeInTheDocument();
    expect(within(proposal).getByText('Original text')).toBeInTheDocument();
    expect(proposal.textContent).not.toMatch(/<\/?p>/);
    expect(props.onApplyRewrite).not.toHaveBeenCalled();

    fireEvent.click(
      within(proposal).getByRole('button', { name: 'Replace text' }),
    );

    expect(props.onApplyRewrite).toHaveBeenCalledWith('<p>Shorter text</p>');
  });

  it('sends non-quick-action presets without an action key', async () => {
    const { props } = renderActions();

    await chooseFromMenu('Hashtags');

    await waitFor(() => {
      expect(props.onRewrite).toHaveBeenCalledWith(
        expect.stringContaining('TikTok hashtags'),
        null,
        'professional',
      );
    });
  });

  it('proposes thread posts and adds them only on accept', async () => {
    const onDraftThread = vi.fn().mockResolvedValue(['Reply one', 'Reply two']);
    const onAddThreadPosts = vi.fn().mockResolvedValue(undefined);
    renderActions({ canDraftThread: true, onAddThreadPosts, onDraftThread });

    await chooseFromMenu('Make Thread');

    const proposal = await screen.findByRole('region', {
      name: 'Proposed thread',
    });
    expect(within(proposal).getByText('Reply one')).toBeInTheDocument();
    expect(within(proposal).getByText('Post 3')).toBeInTheDocument();
    expect(onAddThreadPosts).not.toHaveBeenCalled();

    fireEvent.click(within(proposal).getByRole('button', { name: 'Add Post' }));

    await waitFor(() => {
      expect(onAddThreadPosts).toHaveBeenCalledWith(['Reply one', 'Reply two']);
    });
  });

  it('keeps the thread proposal when adding the posts fails', async () => {
    const onAddThreadPosts = vi
      .fn()
      .mockRejectedValue(new Error('save failed'));
    renderActions({
      canDraftThread: true,
      onAddThreadPosts,
      onDraftThread: vi.fn().mockResolvedValue(['Reply one', 'Reply two']),
    });

    await chooseFromMenu('Make Thread');
    fireEvent.click(await screen.findByRole('button', { name: 'Add Post' }));

    await waitFor(() => {
      expect(onAddThreadPosts).toHaveBeenCalledOnce();
    });
    expect(
      await screen.findByRole('region', { name: 'Proposed thread' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reply one')).toBeInTheDocument();
  });

  it('discards a thread proposal without adding posts', async () => {
    const onAddThreadPosts = vi.fn();
    renderActions({
      canDraftThread: true,
      onAddThreadPosts,
      onDraftThread: vi.fn().mockResolvedValue(['Reply one']),
    });

    await chooseFromMenu('Make Thread');
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(onAddThreadPosts).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: 'Proposed thread' }),
    ).not.toBeInTheDocument();
  });

  it('rewrites in the chosen tone', async () => {
    const { props } = renderActions();

    await userEvent.click(screen.getByRole('button', { name: 'Improve' }));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Viral' }),
    );
    await chooseFromMenu('Simplify');

    await waitFor(() => {
      expect(props.onRewrite).toHaveBeenCalledWith(
        expect.stringContaining('Simplify'),
        'simplify',
        'viral',
      );
    });
  });

  it('shows no proposal when the rewrite fails', async () => {
    renderActions({ onRewrite: vi.fn().mockResolvedValue(null) });

    await chooseFromMenu('Shorten');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Improve' })).toBeEnabled();
    });
    expect(
      screen.queryByRole('region', { name: 'AI rewrite' }),
    ).not.toBeInTheDocument();
  });

  it('hands free-form requests to the agent', () => {
    const onAskAgent = vi.fn();
    renderActions({ onAskAgent });

    fireEvent.click(screen.getByRole('button', { name: 'Ask agent' }));

    expect(onAskAgent).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('hides the agent button where no agent can open', () => {
    renderActions();

    expect(
      screen.queryByRole('button', { name: 'Ask agent' }),
    ).not.toBeInTheDocument();
  });

  it('disables presets while the page is busy', () => {
    renderActions({ isBusy: true });

    expect(screen.getByRole('button', { name: 'Improve' })).toBeDisabled();
  });
});

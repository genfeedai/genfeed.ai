import '@testing-library/jest-dom/vitest';
import { POST_ENHANCEMENT_CREDITS } from '@genfeedai/contracts/constants';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostComposerActions from '@/features/posts/components/composer-actions/PostComposerActions';
import type { PostComposerActionsProps } from '@/features/posts/components/composer-actions/PostComposerActions.props';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/prompt-bars/components/toolbar/PromptBarCompactSelect', () => ({
  default: ({
    ariaLabel,
    value,
    options,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    options: Array<{ label: string; value: string }>;
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

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

describe('PostComposerActions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the rewrite presets as one row of buttons', () => {
    renderActions();

    expect(
      screen.getByRole('region', { name: 'AI actions' }),
    ).toBeInTheDocument();
    for (const name of ['Shorten', 'Simplify', 'Boost', 'Hashtags']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: 'Turn into a thread' }),
    ).not.toBeInTheDocument();
  });

  it('shows the credits an enhancement is admitted for, not a hard-coded 1', () => {
    renderActions();

    // The enhancements route holds the Gemini 3.8 Flash row's flat cost: 3.
    expect(POST_ENHANCEMENT_CREDITS).toBe(3);
    expect(screen.getByText('3 credits per run')).toBeInTheDocument();
    expect(screen.queryByText('1 credit per run')).not.toBeInTheDocument();
  });

  it('offers thread presets only when allowed', () => {
    renderActions({
      canAddFirstComment: true,
      canDraftThread: true,
      canEndWithGrok: true,
    });

    expect(
      screen.getByRole('button', { name: 'Turn into a thread' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'End with @grok' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add first comment' }),
    ).toBeInTheDocument();
  });

  it('proposes a rewrite as plain text and applies it only on accept', async () => {
    const { props } = renderActions();

    fireEvent.click(screen.getByRole('button', { name: 'Shorten' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Hashtags' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Turn into a thread' }));

    const proposal = await screen.findByRole('region', {
      name: 'Proposed thread',
    });
    expect(within(proposal).getByText('Reply one')).toBeInTheDocument();
    expect(within(proposal).getByText('Post 3')).toBeInTheDocument();
    expect(onAddThreadPosts).not.toHaveBeenCalled();

    fireEvent.click(
      within(proposal).getByRole('button', { name: 'Add to thread' }),
    );

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

    fireEvent.click(screen.getByRole('button', { name: 'Turn into a thread' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add to thread' }),
    );

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

    fireEvent.click(screen.getByRole('button', { name: 'Turn into a thread' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(onAddThreadPosts).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: 'Proposed thread' }),
    ).not.toBeInTheDocument();
  });

  it('runs thread actions that need no AI directly', () => {
    const onEndWithGrok = vi.fn();
    const onAddFirstComment = vi.fn();
    renderActions({
      canAddFirstComment: true,
      canEndWithGrok: true,
      onAddFirstComment,
      onEndWithGrok,
    });

    fireEvent.click(screen.getByRole('button', { name: 'End with @grok' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add first comment' }));

    expect(onEndWithGrok).toHaveBeenCalledOnce();
    expect(onAddFirstComment).toHaveBeenCalledOnce();
  });

  it('rewrites in the chosen tone', async () => {
    const { props } = renderActions();

    fireEvent.change(screen.getByLabelText('Tone'), {
      target: { value: 'viral' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Simplify' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Shorten' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Shorten' })).toBeEnabled();
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

    expect(screen.getByRole('button', { name: 'Shorten' })).toBeDisabled();
  });
});

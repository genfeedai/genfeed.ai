import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import PostComposerPromptBar from '@ui/posts/composer-prompt-bar/PostComposerPromptBar';
import type { PostComposerPromptBarProps } from '@ui/posts/composer-prompt-bar/PostComposerPromptBar.props';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The TipTap editor needs a real DOM layout; a textarea keeps these tests on
// the bar's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    value,
    isDisabled,
    onValueChange,
    onSubmit,
  }: {
    ariaLabel?: string;
    value?: string;
    isDisabled?: boolean;
    onValueChange?: (value: string) => void;
    onSubmit?: () => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      disabled={isDisabled}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onSubmit?.();
        }
      }}
    />
  ),
}));

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

vi.mock('@ui/layout/prompt-bar-container/PromptBarContainer', () => ({
  default: ({
    children,
    topContent,
  }: {
    children: ReactNode;
    topContent?: ReactNode;
  }) => (
    <div>
      {topContent}
      {children}
    </div>
  ),
}));

function renderBar(overrides: Partial<PostComposerPromptBarProps> = {}) {
  const props: PostComposerPromptBarProps = {
    isBusy: false,
    onApplyRewrite: vi.fn(),
    onRewrite: vi.fn().mockResolvedValue('<p>Shorter text</p>'),
    platformLabel: 'TikTok',
    targetContent: '<p>Original text</p>',
    targetLabel: 'Caption',
    ...overrides,
  };
  return { ...render(<PostComposerPromptBar {...props} />), props };
}

describe('PostComposerPromptBar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows what it acts on and the rewrite presets', () => {
    renderBar();

    expect(screen.getByText('Caption')).toBeInTheDocument();
    for (const name of ['Shorten', 'Simplify', 'Boost', 'Hashtags']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: 'Turn into a thread' }),
    ).not.toBeInTheDocument();
  });

  it('offers thread presets only when allowed', () => {
    renderBar({
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
    const { props } = renderBar();

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
    const { props } = renderBar();

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
    renderBar({ canDraftThread: true, onAddThreadPosts, onDraftThread });

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

  it('discards a thread proposal without adding posts', async () => {
    const onAddThreadPosts = vi.fn();
    renderBar({
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
    renderBar({
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

  it('submits a custom instruction with the chosen tone', async () => {
    const { props } = renderBar();

    fireEvent.change(screen.getByLabelText('Tone'), {
      target: { value: 'viral' },
    });
    fireEvent.change(screen.getByLabelText('Ask AI to write or rewrite'), {
      target: { value: '  open with the result  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }));

    await waitFor(() => {
      expect(props.onRewrite).toHaveBeenCalledWith(
        'open with the result',
        null,
        'viral',
      );
    });
  });

  it('keeps the instruction when the rewrite fails', async () => {
    renderBar({ onRewrite: vi.fn().mockResolvedValue(null) });

    fireEvent.change(screen.getByLabelText('Ask AI to write or rewrite'), {
      target: { value: 'make it sharper' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rewrite' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Ask AI to write or rewrite')).toHaveValue(
        'make it sharper',
      );
    });
    expect(
      screen.queryByRole('region', { name: 'AI rewrite' }),
    ).not.toBeInTheDocument();
  });

  it('disables presets while the page is busy', () => {
    renderBar({ isBusy: true });

    expect(screen.getByRole('button', { name: 'Shorten' })).toBeDisabled();
  });
});

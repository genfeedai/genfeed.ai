import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { PostEnhancementBarProps } from '@ui/posts/enhancement-bar/PostEnhancementBar.props';
import PostEnhancementBar from '@ui/posts/enhancement-bar/post-enhancement-bar/PostEnhancementBar';
import { afterEach, describe, expect, it, vi } from 'vitest';

const POST_ID = 'post_1';
const PROMPT_LABEL = 'Rewrite instruction';

function renderBar(overrides: Partial<PostEnhancementBarProps> = {}) {
  const props: PostEnhancementBarProps = {
    enhancingAction: null,
    isEnhancing: false,
    onPromptEnhance: vi.fn().mockResolvedValue('Rewritten text'),
    onQuickAction: vi.fn().mockResolvedValue('Rewritten text'),
    postId: POST_ID,
    ...overrides,
  };

  return { ...render(<PostEnhancementBar {...props} />), props };
}

function typePrompt(value: string): void {
  fireEvent.change(screen.getByLabelText(PROMPT_LABEL), {
    target: { value },
  });
}

describe('PostEnhancementBar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('exposes media selection as a named visible action', () => {
    const onSelectMedia = vi.fn();
    renderBar({ onSelectMedia });
    fireEvent.click(screen.getByRole('button', { name: 'Add media' }));
    expect(onSelectMedia).toHaveBeenCalledOnce();
  });

  it('labels the AI rewrite actions instead of relying on icons', () => {
    renderBar();

    for (const name of ['Shorten', 'Simplify', 'Boost']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('submits the trimmed prompt with the current tone', async () => {
    const onPromptEnhance = vi.fn().mockResolvedValue('Rewritten text');
    renderBar({ onPromptEnhance });

    typePrompt('  make it sharper  ');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    await waitFor(() => {
      expect(onPromptEnhance).toHaveBeenCalledWith(
        POST_ID,
        'make it sharper',
        'professional',
      );
    });
  });

  it('shows the rewrite as a proposal and applies it only on accept', async () => {
    const onApplyProposal = vi.fn();
    renderBar({
      currentContent: '<p>Original text</p>',
      onApplyProposal,
      onQuickAction: vi.fn().mockResolvedValue('<p>Shorter text</p>'),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Shorten' }));

    const proposal = await screen.findByRole('region', { name: 'AI rewrite' });
    expect(onApplyProposal).not.toHaveBeenCalled();
    // The proposal and the "before" text are readable text, never raw markup.
    expect(within(proposal).getByText('Shorter text')).toBeInTheDocument();
    expect(within(proposal).getByText('Original text')).toBeInTheDocument();
    expect(proposal.textContent).not.toMatch(/<\/?p>/);

    fireEvent.click(
      within(proposal).getByRole('button', { name: 'Replace text' }),
    );

    expect(onApplyProposal).toHaveBeenCalledWith('<p>Shorter text</p>');
    expect(
      screen.queryByRole('region', { name: 'AI rewrite' }),
    ).not.toBeInTheDocument();
  });

  it('discards a proposal without applying it', async () => {
    const onApplyProposal = vi.fn();
    renderBar({ onApplyProposal });

    fireEvent.click(screen.getByRole('button', { name: 'Boost' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(onApplyProposal).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('region', { name: 'AI rewrite' }),
    ).not.toBeInTheDocument();
  });

  it('shows no proposal when the rewrite fails', async () => {
    const onQuickAction = vi.fn().mockResolvedValue(null);
    renderBar({ onQuickAction });

    fireEvent.click(screen.getByRole('button', { name: 'Shorten' }));

    await waitFor(() => {
      expect(onQuickAction).toHaveBeenCalledOnce();
    });
    expect(
      screen.queryByRole('region', { name: 'AI rewrite' }),
    ).not.toBeInTheDocument();
  });

  it('clears the prompt on success and keeps it on failure', async () => {
    const { unmount } = renderBar();

    typePrompt('make it sharper');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue('');
    });

    unmount();

    renderBar({ onPromptEnhance: vi.fn().mockResolvedValue(null) });
    typePrompt('make it sharper');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(PROMPT_LABEL)).toHaveValue(
        'make it sharper',
      );
    });
  });

  it('submits on Enter and does nothing on Shift+Enter', async () => {
    const onPromptEnhance = vi.fn().mockResolvedValue('Rewritten text');
    renderBar({ onPromptEnhance });

    typePrompt('make it sharper');
    const input = screen.getByLabelText(PROMPT_LABEL);

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onPromptEnhance).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(onPromptEnhance).toHaveBeenCalledTimes(1);
    });
  });

  it('refuses to submit an empty prompt', () => {
    const onPromptEnhance = vi.fn();
    renderBar({ onPromptEnhance });

    fireEvent.keyDown(screen.getByLabelText(PROMPT_LABEL), {
      key: 'Enter',
    });

    expect(onPromptEnhance).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /enhance/i })).toBeDisabled();
  });

  it('locks the prompt and submit while an enhancement is in flight', () => {
    renderBar({ isEnhancing: true });

    expect(screen.getByLabelText(PROMPT_LABEL)).toBeDisabled();
    expect(screen.getByRole('button', { name: /enhance/i })).toBeDisabled();
  });

  it('reports save state as text and offers Save only when dirty', () => {
    const onSave = vi.fn();
    const { rerender, props } = renderBar({ isDirty: false, onSave });

    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();

    rerender(<PostEnhancementBar {...props} isDirty onSave={onSave} />);

    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledOnce();
  });
});

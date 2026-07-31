import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PostEnhancementBarProps } from '@ui/posts/enhancement-bar/PostEnhancementBar.props';
import PostEnhancementBar from '@ui/posts/enhancement-bar/post-enhancement-bar/PostEnhancementBar';
import { afterEach, describe, expect, it, vi } from 'vitest';

const POST_ID = 'post_1';

function renderBar(overrides: Partial<PostEnhancementBarProps> = {}) {
  const props: PostEnhancementBarProps = {
    enhancingAction: null,
    isEnhancing: false,
    onPromptEnhance: vi.fn().mockResolvedValue(undefined),
    onQuickAction: vi.fn(),
    postId: POST_ID,
    ...overrides,
  };

  return { ...render(<PostEnhancementBar {...props} />), props };
}

function typePrompt(value: string): void {
  fireEvent.change(screen.getByPlaceholderText(/enhance this post/i), {
    target: { value },
  });
}

describe('PostEnhancementBar', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the prompt input', () => {
    renderBar();

    expect(
      screen.getByPlaceholderText(/enhance this post/i),
    ).toBeInTheDocument();
  });

  it('submits the trimmed prompt with the current tone', async () => {
    const onPromptEnhance = vi.fn().mockResolvedValue(undefined);
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

  it('sends the tone picked after mount', async () => {
    const onPromptEnhance = vi.fn().mockResolvedValue(undefined);
    renderBar({ onPromptEnhance });

    fireEvent.click(screen.getByRole('button', { name: /^viral$/i }));
    typePrompt('make it sharper');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    await waitFor(() => {
      expect(onPromptEnhance).toHaveBeenCalledWith(
        POST_ID,
        'make it sharper',
        'viral',
      );
    });
  });

  it('clears the prompt on success and keeps it on failure', async () => {
    const { unmount } = renderBar();

    typePrompt('make it sharper');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/enhance this post/i)).toHaveValue('');
    });

    unmount();

    renderBar({
      onPromptEnhance: vi.fn().mockRejectedValue(new Error('nope')),
    });
    typePrompt('make it sharper');
    fireEvent.click(screen.getByRole('button', { name: /enhance/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/enhance this post/i)).toHaveValue(
        'make it sharper',
      );
    });
  });

  it('submits on Enter and does nothing on Shift+Enter', async () => {
    const onPromptEnhance = vi.fn().mockResolvedValue(undefined);
    renderBar({ onPromptEnhance });

    typePrompt('make it sharper');
    const input = screen.getByPlaceholderText(/enhance this post/i);

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

    fireEvent.keyDown(screen.getByPlaceholderText(/enhance this post/i), {
      key: 'Enter',
    });

    expect(onPromptEnhance).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /enhance/i })).toBeDisabled();
  });

  it('locks the prompt and submit while an enhancement is in flight', () => {
    renderBar({ isEnhancing: true });

    expect(screen.getByPlaceholderText(/enhance this post/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /enhance/i })).toBeDisabled();
  });
});

import PostsWritePage from './posts-write-page';
import '@testing-library/jest-dom';
import { PostStatus } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const searchParamsState = new URLSearchParams();
const postMock = vi.fn();
const generateTweetsMock = vi.fn();
const generateThreadMock = vi.fn();
const trackMock = vi.fn();
const useBrandMock = vi.fn();
const copyToClipboardMock = vi.fn();
const workingTitlePlaceholder = 'Optional internal title for the draft';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generateThread: generateThreadMock,
    generateTweets: generateTweetsMock,
    post: postMock,
  }),
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({
      copyToClipboard: copyToClipboardMock,
    }),
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'moonrise-studio', orgSlug: 'moonrise-org' }),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  useSearchParams: () => searchParamsState,
}));

vi.mock('@vercel/analytics', () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

describe('PostsWritePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.forEach((_, key) => {
      searchParamsState.delete(key);
    });
    useBrandMock.mockReturnValue({
      credentials: [],
    });
  });

  it('shows the empty state when no connected accounts are available', () => {
    render(<PostsWritePage />);

    expect(
      screen.getByText(/Post mode is open right away/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy content' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Save draft in Genfeed' }),
    ).toBeDisabled();
  });

  it('creates a blank draft and redirects to the post detail page', async () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          id: 'cred-1',
          isConnected: true,
          platform: 'twitter',
        },
      ],
    });
    postMock.mockResolvedValue({ id: 'post-1' });

    render(<PostsWritePage />);

    fireEvent.change(screen.getByPlaceholderText(workingTitlePlaceholder), {
      target: { value: 'Launch note' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save draft in Genfeed' }),
    );

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith({
        credential: 'cred-1',
        description: 'Draft',
        ingredients: [],
        label: 'Launch note',
        status: PostStatus.DRAFT,
      });
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/moonrise-org/moonrise-studio/posts/post-1',
    );
    expect(trackMock).toHaveBeenCalledWith(
      'content_write_blank_draft_started',
      expect.objectContaining({ hasPrefilledIngredient: false }),
    );
  });

  it('prefills a supervised draft handoff with the selected ingredient', async () => {
    searchParamsState.set(
      'description',
      'Review this generated clip before publishing',
    );
    searchParamsState.set('ingredientId', 'video-123');
    searchParamsState.set('title', 'Launch clip');
    useBrandMock.mockReturnValue({
      credentials: [
        {
          id: 'cred-1',
          isConnected: true,
          platform: 'instagram',
        },
      ],
    });
    postMock.mockResolvedValue({ id: 'post-2' });

    render(<PostsWritePage />);

    expect(
      screen.getByText(/generated asset is preselected for supervised review/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(workingTitlePlaceholder)).toHaveValue(
      'Launch clip',
    );
    expect(screen.getByLabelText('Draft content')).toHaveValue(
      'Review this generated clip before publishing',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Save draft in Genfeed' }),
    );

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith({
        credential: 'cred-1',
        description: 'Review this generated clip before publishing',
        ingredients: ['video-123'],
        label: 'Launch clip',
        status: PostStatus.DRAFT,
      });
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/moonrise-org/moonrise-studio/posts/post-2',
    );
  });

  it('generates a single post from the prompt and redirects to the draft', async () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          id: 'cred-1',
          isConnected: true,
          platform: 'twitter',
        },
      ],
    });
    generateTweetsMock.mockResolvedValue([{ id: 'generated-1' }]);

    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Write a post about AI agents' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate post in Genfeed' }),
    );

    await waitFor(() => {
      expect(generateTweetsMock).toHaveBeenCalledWith({
        count: 1,
        credential: 'cred-1',
        tone: 'professional',
        topic: 'Write a post about AI agents',
      });
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/moonrise-org/moonrise-studio/posts/generated-1',
    );
    expect(trackMock).toHaveBeenCalledWith(
      'content_write_prompt_generated',
      expect.objectContaining({ mode: 'post' }),
    );
  });

  it('generates a thread from the prompt and redirects to the root draft', async () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          id: 'cred-1',
          isConnected: true,
          platform: 'twitter',
        },
      ],
    });
    generateThreadMock.mockResolvedValue([{ id: 'thread-root' }]);

    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Create a 5-part thread on product strategy' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate thread in Genfeed' }),
    );

    await waitFor(() => {
      expect(generateThreadMock).toHaveBeenCalledWith({
        count: 5,
        credential: 'cred-1',
        tone: 'professional',
        topic: 'Create a 5-part thread on product strategy',
      });
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/moonrise-org/moonrise-studio/posts/thread-root',
    );
    expect(trackMock).toHaveBeenCalledWith(
      'content_write_prompt_generated',
      expect.objectContaining({ mode: 'thread' }),
    );
  });

  it('preserves the prompt and shows an inline error when generation fails', async () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          id: 'cred-1',
          isConnected: true,
          platform: 'twitter',
        },
      ],
    });
    generateTweetsMock.mockRejectedValue(new Error('Generation failed'));

    render(<PostsWritePage />);

    const promptField = screen.getByLabelText('Prompt');
    fireEvent.change(promptField, {
      target: { value: 'Keep this prompt after failure' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate post in Genfeed' }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('Failed to generate content. Please try again.'),
      ).toBeInTheDocument();
    });

    expect(promptField).toHaveValue('Keep this prompt after failure');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('copies title and content when both are present', async () => {
    render(<PostsWritePage />);

    fireEvent.change(screen.getByPlaceholderText(workingTitlePlaceholder), {
      target: { value: 'Launch memo' },
    });
    fireEvent.change(screen.getByLabelText('Draft content'), {
      target: { value: 'Ship the update on Friday.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy content' }));

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledWith(
        'Launch memo\n\nShip the update on Friday.',
      );
    });
  });

  it('copies content when only body text is present', async () => {
    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Draft content'), {
      target: { value: 'Body-only draft' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy content' }));

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledWith('Body-only draft');
    });
  });

  it('shows an inline error when copy is attempted with no content', async () => {
    render(<PostsWritePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy content' }));

    await waitFor(() => {
      expect(
        screen.getByText('Add content before copying.'),
      ).toBeInTheDocument();
    });
    expect(copyToClipboardMock).not.toHaveBeenCalled();
  });
});

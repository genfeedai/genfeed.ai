import PostsWritePage from './posts-write-page';
import '@testing-library/jest-dom/vitest';
import { PostStatus } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from '@/lib/analytics';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const searchParamsState = new URLSearchParams();
const postMock = vi.fn();
const generateAccountContentMock = vi.fn();
const generateTweetsMock = vi.fn();
const generateThreadMock = vi.fn();
const captureAnalyticsEventMock = vi.fn();
const useBrandMock = vi.fn();
const copyToClipboardMock = vi.fn();
const workingTitlePlaceholder = 'Optional internal title for the draft';
const desktopRuntimeMocks = vi.hoisted(() => ({
  getDesktopBridge: vi.fn(),
  isDesktopClient: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generateAccountContent: generateAccountContentMock,
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
  usePathname: () => '/moonrise-org/moonrise-studio/compose/post',
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
  useSearchParams: () => searchParamsState,
}));

vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  captureAnalyticsEvent: (...args: unknown[]) =>
    captureAnalyticsEventMock(...args),
}));

vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: desktopRuntimeMocks.getDesktopBridge,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: desktopRuntimeMocks.isDesktopClient,
}));

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.setPointerCapture ??= () => undefined;
});

function openSelect(name: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name }), {
    button: 0,
    ctrlKey: false,
    pointerId: 1,
    pointerType: 'mouse',
  });
}

describe('PostsWritePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.forEach((_, key) => {
      searchParamsState.delete(key);
    });
    generateAccountContentMock.mockReset();
    useBrandMock.mockReturnValue({
      credentials: [],
    });
    desktopRuntimeMocks.getDesktopBridge.mockReturnValue(null);
    desktopRuntimeMocks.isDesktopClient.mockReturnValue(false);
  });

  it('captures content_write_opened on mount', () => {
    render(<PostsWritePage />);

    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CONTENT_WRITE_OPENED,
      {},
    );
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
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CONTENT_WRITE_BLANK_DRAFT_STARTED,
      {
        hasPrefilledIngredient: false,
        platform: 'twitter',
      },
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
    generateAccountContentMock.mockResolvedValue([{ id: 'generated-1' }]);

    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Write a post about AI agents' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate in Genfeed (Post)' }),
    );

    await waitFor(() => {
      expect(generateAccountContentMock).toHaveBeenCalledWith({
        count: 1,
        credential: 'cred-1',
        format: 'post',
        tone: 'professional',
        topic: 'Write a post about AI agents',
      });
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/moonrise-org/moonrise-studio/posts/generated-1',
    );
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CONTENT_WRITE_PROMPT_GENERATED,
      { platform: 'twitter' },
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
    generateAccountContentMock.mockResolvedValue([{ id: 'thread-root' }]);

    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Create a 5-part thread on product strategy' },
    });
    openSelect('Format');
    fireEvent.click(await screen.findByRole('option', { name: 'Thread' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate in Genfeed (Thread)' }),
    );

    await waitFor(() => {
      expect(generateAccountContentMock).toHaveBeenCalledWith({
        count: 5,
        credential: 'cred-1',
        format: 'thread',
        tone: 'professional',
        topic: 'Create a 5-part thread on product strategy',
      });
    });

    expect(pushMock).toHaveBeenCalledWith(
      '/moonrise-org/moonrise-studio/posts/thread-root',
    );
    expect(captureAnalyticsEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.CONTENT_WRITE_PROMPT_GENERATED,
      { platform: 'twitter' },
    );
  });

  it('keeps the connected account selector labeled Account and exposes X Article for X accounts', async () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          externalHandle: 'genfeed',
          id: 'cred-1',
          isConnected: true,
          platform: 'twitter',
        },
      ],
    });

    render(<PostsWritePage />);

    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(
      screen.getByText(/280 weighted characters per post/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Publishable/i)).toBeInTheDocument();

    openSelect('Format');

    expect(
      await screen.findByRole('option', { name: 'X Article' }),
    ).toBeInTheDocument();
  });

  it('routes X Article format to the article composer with account context', async () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          externalHandle: 'genfeed',
          id: 'cred-1',
          isConnected: true,
          platform: 'twitter',
        },
      ],
    });

    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Write an X Article about autonomous content systems' },
    });
    openSelect('Format');
    fireEvent.click(await screen.findByRole('option', { name: 'X Article' }));
    expect(screen.getByText(/Copy only/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate in Genfeed (X Article)' }),
    );

    expect(pushMock).toHaveBeenCalledWith(
      '/moonrise-org/moonrise-studio/compose/article?credentialId=cred-1&prompt=Write+an+X+Article+about+autonomous+content+systems&type=x-article',
    );
    expect(generateAccountContentMock).not.toHaveBeenCalled();
  });

  it('renders platform preview limits from channel capabilities', () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          externalHandle: 'genfeed',
          id: 'cred-1',
          isConnected: true,
          platform: 'linkedin',
        },
      ],
    });

    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Draft content'), {
      target: { value: 'x'.repeat(3001) },
    });

    expect(screen.getByText('3001/3000')).toBeInTheDocument();
    expect(
      screen.getByText('LinkedIn captions must be 3000 characters or fewer.'),
    ).toBeInTheDocument();
  });

  it('generates local desktop content when no connected accounts are available', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      content: 'Generated local post',
      id: 'local-post-1',
      platform: 'twitter',
      type: 'caption',
    });
    const queueJob = vi.fn().mockResolvedValue({ id: 'job-1' });
    desktopRuntimeMocks.isDesktopClient.mockReturnValue(true);
    desktopRuntimeMocks.getDesktopBridge.mockReturnValue({
      cloud: { generateContent },
      sync: { queueJob },
    });

    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Write locally about offline workflows' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate (Post)' }));

    await waitFor(() => {
      expect(generateContent).toHaveBeenCalledWith({
        platform: 'twitter',
        prompt: 'Tone: professional\nWrite locally about offline workflows',
        publishIntent: 'review',
        type: 'caption',
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Draft content')).toHaveValue(
        'Generated local post',
      );
      expect(queueJob).toHaveBeenCalledWith(
        'post-draft',
        expect.stringContaining('Generated local post'),
      );
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('falls back to desktop IPC when cloud generation fails in desktop shell', async () => {
    useBrandMock.mockReturnValue({
      credentials: [
        {
          id: 'cred-1',
          isConnected: true,
          platform: 'twitter',
        },
      ],
    });
    generateAccountContentMock.mockRejectedValue(new Error('network offline'));
    const generateContent = vi.fn().mockResolvedValue({
      content: 'Desktop fallback post',
      id: 'fallback-post-1',
      platform: 'twitter',
      type: 'caption',
    });
    desktopRuntimeMocks.isDesktopClient.mockReturnValue(true);
    desktopRuntimeMocks.getDesktopBridge.mockReturnValue({
      cloud: { generateContent },
      sync: { queueJob: vi.fn().mockResolvedValue({ id: 'job-1' }) },
    });

    render(<PostsWritePage />);

    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'Recover from cloud failure' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate in Genfeed (Post)' }),
    );

    await waitFor(() => {
      expect(generateContent).toHaveBeenCalledWith({
        platform: 'twitter',
        prompt: 'Tone: professional\nRecover from cloud failure',
        publishIntent: 'review',
        type: 'caption',
      });
    });

    expect(screen.getByLabelText('Draft content')).toHaveValue(
      'Desktop fallback post',
    );
    expect(pushMock).not.toHaveBeenCalled();
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
    generateAccountContentMock.mockRejectedValue(
      new Error('Generation failed'),
    );

    render(<PostsWritePage />);

    const promptField = screen.getByLabelText('Prompt');
    fireEvent.change(promptField, {
      target: { value: 'Keep this prompt after failure' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate in Genfeed (Post)' }),
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

import '@testing-library/jest-dom/vitest';
import { Platform, PostFormat, PostStatus } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostEditorContent from './post-editor-content';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  error: vi.fn(),
  findOne: vi.fn(),
  loggerError: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  returnTo: '/acme/main/publish?status=draft' as string | null,
  success: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    delete: mocks.delete,
    findOne: mocks.findOne,
    patch: mocks.patch,
    post: mocks.post,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    brandSlug: 'main',
    href: (path: string) => `/acme/main${path}`,
    orgHref: (path: string) => `/acme${path}`,
    orgSlug: 'acme',
  }),
}));

vi.mock('@services/content/posts.service', () => ({
  PostsService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError, info: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.error, success: mocks.success }),
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'returnTo' ? mocks.returnTo : null),
  }),
}));

vi.mock('@ui/primitives/date-time-picker', () => ({
  default: ({ value }: { value?: string }) => (
    <span data-testid="scheduled-date">{value ?? ''}</span>
  ),
}));

const post = {
  description: 'Original body',
  children: [],
  credential: { id: 'credential-1' },
  format: PostFormat.STANDARD,
  id: 'post-1',
  label: 'Launch post',
  platform: Platform.TWITTER,
  scheduledDate: '2026-03-11T10:00:00.000Z',
  status: PostStatus.DRAFT,
};

describe('PostEditorContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returnTo = '/acme/main/publish?status=draft';
    mocks.findOne.mockResolvedValue(post);
    mocks.patch.mockResolvedValue({ ...post, label: 'Launch post revised' });
  });

  it('loads the post and returns to the list it was opened from', async () => {
    render(<PostEditorContent artifactId="post-1" />);

    expect(await screen.findByText('Launch post')).toBeVisible();
    expect(mocks.findOne).toHaveBeenCalledWith(
      'post-1',
      {},
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('link', { name: /back to posts/i }),
    ).toHaveAttribute('href', '/acme/main/publish?status=draft');
  });

  it('falls back to the posts list when the return target is unusable', async () => {
    mocks.returnTo = 'https://evil.example.com/posts';

    render(<PostEditorContent artifactId="post-1" />);

    expect(await screen.findByText('Launch post')).toBeVisible();
    expect(
      screen.getByRole('link', { name: /back to posts/i }),
    ).toHaveAttribute('href', '/acme/main/publish/posts');
  });

  it('saves edited metadata back to the artifact', async () => {
    const { container } = render(<PostEditorContent artifactId="post-1" />);

    expect(await screen.findByText('Launch post')).toBeVisible();

    // The save control lives in the shell rail, so it reaches the fields
    // through the form id rather than by being nested inside the form.
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'form',
      'post-editor-form',
    );

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Launch post revised' },
    });

    const form = container.querySelector('#post-editor-form');
    if (!form) {
      throw new Error('Post editor form did not render');
    }

    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('post-1', {
        description: 'Original body',
        format: PostFormat.STANDARD,
        label: 'Launch post revised',
        scheduledDate: '2026-03-11T10:00:00.000Z',
        status: PostStatus.DRAFT,
      });
    });
    expect(mocks.success).toHaveBeenCalledWith('Post updated successfully');
  });

  it('omits an empty scheduled date from the update payload', async () => {
    mocks.findOne.mockResolvedValue({ ...post, scheduledDate: null });
    const { container } = render(<PostEditorContent artifactId="post-1" />);

    expect(await screen.findByText('Launch post')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Launch post revised' },
    });

    const form = container.querySelector('#post-editor-form');
    if (!form) {
      throw new Error('Post editor form did not render');
    }

    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('post-1', {
        description: 'Original body',
        format: PostFormat.STANDARD,
        label: 'Launch post revised',
        status: PostStatus.DRAFT,
      });
    });
  });

  it('edits linked thread segments through the canonical post service', async () => {
    const threadPost = {
      ...post,
      children: [
        {
          description: 'Original reply',
          id: 'reply-1',
          order: 1,
        },
      ],
      format: PostFormat.THREAD,
    };
    mocks.findOne.mockResolvedValue(threadPost);
    const { container } = render(<PostEditorContent artifactId="post-1" />);

    expect(await screen.findByText('Thread replies')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Content'), {
      target: { value: 'Revised reply' },
    });

    const form = container.querySelector('#post-editor-form');
    if (!form) {
      throw new Error('Post editor form did not render');
    }
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith('reply-1', {
        description: 'Revised reply',
        format: PostFormat.THREAD,
      });
    });
  });

  it('explains an artifact that could not be loaded', async () => {
    mocks.findOne.mockRejectedValue(new Error('gone'));

    render(<PostEditorContent artifactId="post-1" />);

    expect(await screen.findByText('Post not found')).toBeVisible();
    expect(mocks.error).toHaveBeenCalledWith('Failed to load post');
  });
});

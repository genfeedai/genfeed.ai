import {
  CredentialPlatform,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReleaseTargetPreview from '@/features/posts/release/release-target-preview';
import '@testing-library/jest-dom/vitest';

const findOne = vi.fn();

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(async () => 'token-123'),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: vi.fn() }),
}));
vi.mock('@services/content/posts.service', () => ({
  PostsService: { getInstance: () => ({ findOne }) },
}));
vi.mock('@/components/previews/TargetPreview', () => ({
  default: ({
    credential,
    release,
  }: {
    credential: { externalName?: string };
    release: { media?: Array<{ url?: string | null }> };
  }) => (
    <div
      data-author={credential.externalName}
      data-media={(release.media ?? []).map((item) => item.url).join(',')}
      data-testid="target-preview"
    />
  ),
}));
vi.mock(
  '@/features/posts/components/posts/preview/thread-preview-panel/ThreadPreviewPanel',
  () => ({
    default: ({
      parent,
      replies,
    }: {
      parent: { content: string; status?: React.ReactNode };
      replies: Array<{ content: string; status?: React.ReactNode }>;
    }) => (
      <div data-testid="thread-preview">
        {[parent, ...replies].map((post) => (
          <div key={post.content}>
            {post.content}
            {post.status}
          </div>
        ))}
      </div>
    ),
  }),
);

const release = { id: 'release-1' } as IReleaseGroup;

function target(platform: CredentialPlatform): IChannelTarget {
  return {
    executionState: TargetExecutionState.PUBLISHED,
    id: 'target-1',
    platform,
    retryCount: 0,
    source: ReleaseTargetSource.MANUAL,
    timezone: 'UTC',
  } as unknown as IChannelTarget;
}

describe('ReleaseTargetPreview', () => {
  beforeEach(() => findOne.mockReset());

  it('shows each X reply with its own execution state', async () => {
    findOne.mockResolvedValue({
      children: [
        {
          description: '@grok What is your take?',
          id: 'reply-1',
          order: 1,
          targetError: { code: 'parent_failed', message: 'Parent post failed' },
          targetExecutionState: TargetExecutionState.FAILED,
        },
      ],
      description: 'Parent tweet',
      id: 'target-1',
    });

    render(
      <ReleaseTargetPreview
        release={release}
        target={target(CredentialPlatform.TWITTER)}
      />,
    );

    const thread = await screen.findByTestId('thread-preview');
    expect(thread).toHaveTextContent('Parent tweet');
    expect(thread).toHaveTextContent('@grok What is your take?');
    expect(thread).toHaveTextContent('Parent post failed');
    expect(thread).toHaveTextContent(TargetExecutionState.FAILED);
  });

  it('keeps the single platform preview for an X post without replies', async () => {
    findOne.mockResolvedValue({ children: [], id: 'target-1' });

    render(
      <ReleaseTargetPreview
        release={release}
        target={target(CredentialPlatform.TWITTER)}
      />,
    );

    await waitFor(() => expect(findOne).toHaveBeenCalledWith('target-1'));
    expect(screen.getByTestId('target-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('thread-preview')).not.toBeInTheDocument();
  });

  it('draws the connected account and slides from the post when the release has no media', async () => {
    findOne.mockResolvedValue({
      credential: { externalName: 'Shayla', platform: 'instagram' },
      id: 'target-1',
      ingredients: [
        { category: 'image', cdnUrl: 'https://cdn.test/1.jpg', id: 'a' },
        { category: 'image', cdnUrl: 'https://cdn.test/2.jpg', id: 'b' },
      ],
    });

    render(
      <ReleaseTargetPreview
        release={{ ...release, media: [] } as IReleaseGroup}
        target={target(CredentialPlatform.INSTAGRAM)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('target-preview')).toHaveAttribute(
        'data-media',
        'https://cdn.test/1.jpg,https://cdn.test/2.jpg',
      ),
    );
    expect(screen.getByTestId('target-preview')).toHaveAttribute(
      'data-author',
      'Shayla',
    );
  });

  it('keeps the release media when the release already carries it', async () => {
    findOne.mockResolvedValue({
      id: 'target-1',
      ingredients: [
        { category: 'image', cdnUrl: 'https://cdn.test/x.jpg', id: 'x' },
      ],
    });

    render(
      <ReleaseTargetPreview
        release={
          {
            ...release,
            media: [
              {
                assetId: 'r',
                kind: 'image',
                order: 0,
                url: 'https://cdn.test/r.jpg',
              },
            ],
          } as unknown as IReleaseGroup
        }
        target={target(CredentialPlatform.INSTAGRAM)}
      />,
    );

    await waitFor(() => expect(findOne).toHaveBeenCalled());
    expect(screen.getByTestId('target-preview')).toHaveAttribute(
      'data-media',
      'https://cdn.test/r.jpg',
    );
  });

  it('fills the URL of a release media reference from the post ingredient with the same asset id', async () => {
    findOne.mockResolvedValue({
      id: 'target-1',
      ingredients: [
        { category: 'image', cdnUrl: 'https://cdn.test/a.jpg', id: 'a' },
        { category: 'image', cdnUrl: 'https://cdn.test/b.jpg', id: 'b' },
      ],
    });

    render(
      <ReleaseTargetPreview
        release={
          {
            ...release,
            media: [
              { assetId: 'b', kind: 'image', order: 0 },
              { assetId: 'a', kind: 'image', order: 1 },
            ],
          } as unknown as IReleaseGroup
        }
        target={target(CredentialPlatform.INSTAGRAM)}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('target-preview')).toHaveAttribute(
        'data-media',
        'https://cdn.test/b.jpg,https://cdn.test/a.jpg',
      ),
    );
  });
});

import {
  CredentialPlatform,
  ReleaseTargetSource,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import ReleaseTargetPreview from '@pages/posts/release/release-target-preview';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('@ui/previews/TargetPreview', () => ({
  default: () => <div data-testid="target-preview" />,
}));
vi.mock('@ui/posts/preview/thread-preview-panel/ThreadPreviewPanel', () => ({
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
}));

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

  it('does not load a thread for platforms without replies', () => {
    render(
      <ReleaseTargetPreview
        release={release}
        target={target(CredentialPlatform.INSTAGRAM)}
      />,
    );

    expect(findOne).not.toHaveBeenCalled();
    expect(screen.getByTestId('target-preview')).toBeInTheDocument();
  });
});

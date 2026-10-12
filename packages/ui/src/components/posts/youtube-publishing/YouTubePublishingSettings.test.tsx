import { PostVisibility, TargetExecutionState } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import YouTubePublishingSettings from '@ui/posts/youtube-publishing/YouTubePublishingSettings';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
const { updateTarget, ensureFromPost } = vi.hoisted(() => ({
  updateTarget: vi.fn(),
  ensureFromPost: vi.fn(),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => () =>
    Promise.resolve({ updateTarget, ensureFromPost }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ success: vi.fn() }) },
}));
const post = {
  id: 'post-1',
  groupId: 'group-1',
  ingredients: [],
  targetExecutionState: TargetExecutionState.DRAFT,
} as unknown as IPost;

describe('YouTube publishing settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateTarget.mockResolvedValue({});
    ensureFromPost.mockResolvedValue({ id: 'created-group' });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('requires an explicit privacy selection', () => {
    render(<YouTubePublishingSettings post={post} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose privacy');
    expect(
      screen.getByRole('button', { name: 'Save YouTube settings' }),
    ).toBeDisabled();
  });

  it.each([
    ['Private', PostVisibility.PRIVATE],
    ['Unlisted', PostVisibility.UNLISTED],
    ['Public', PostVisibility.PUBLIC],
  ])(
    'persists %s as both target privacy and audience visibility',
    async (label, visibility) => {
      const onSaved = vi.fn();
      render(<YouTubePublishingSettings post={post} onSaved={onSaved} />);
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.click(await screen.findByRole('option', { name: label }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Save YouTube settings' }),
      );
      await waitFor(() =>
        expect(updateTarget).toHaveBeenCalledWith('group-1', 'post-1', {
          executionState: TargetExecutionState.DRAFT,
          settings: { madeForKids: false, privacyStatus: visibility },
          visibility,
        }),
      );
      expect(onSaved).toHaveBeenCalledOnce();
    },
  );

  it('creates the release for a legacy draft and preserves other settings', async () => {
    render(
      <YouTubePublishingSettings
        post={{
          ...post,
          groupId: undefined,
          targetSettings: {
            privacyStatus: 'private',
            madeForKids: true,
            playlistId: 'playlist-1',
          },
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save YouTube settings' }),
    );
    await waitFor(() =>
      expect(updateTarget).toHaveBeenCalledWith(
        'created-group',
        'post-1',
        expect.objectContaining({
          settings: {
            privacyStatus: 'private',
            madeForKids: true,
            playlistId: 'playlist-1',
          },
        }),
      ),
    );
    expect(ensureFromPost).toHaveBeenCalledWith('post-1');
  });
});

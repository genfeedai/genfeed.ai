import { PostVisibility, TargetExecutionState } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import YouTubePublishingSettings from '@ui/posts/youtube-publishing/YouTubePublishingSettings';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
const { updateTarget, ensureFromPost, notifySuccess, notifyWarning } =
  vi.hoisted(() => ({
    updateTarget: vi.fn(),
    notifySuccess: vi.fn(),
    notifyWarning: vi.fn(),
    ensureFromPost: vi.fn(),
  }));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => () =>
    Promise.resolve({ updateTarget, ensureFromPost }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ success: notifySuccess, warning: notifyWarning }),
  },
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

  it('adopts refreshed settings for the same post', () => {
    const { rerender } = render(<YouTubePublishingSettings post={post} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose privacy');

    rerender(
      <YouTubePublishingSettings
        post={{
          ...post,
          targetSettings: { madeForKids: true, privacyStatus: 'unlisted' },
        }}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Unlisted');
    expect(
      screen.getByRole('checkbox', { name: 'Made for kids' }),
    ).toBeChecked();
  });

  it('preserves edited privacy while adopting refreshed untouched settings', async () => {
    const { rerender } = render(<YouTubePublishingSettings post={post} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Private' }));
    rerender(
      <YouTubePublishingSettings
        post={{
          ...post,
          targetSettings: { privacyStatus: 'unlisted', madeForKids: true },
        }}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Private');
    expect(
      screen.getByRole('checkbox', { name: 'Made for kids' }),
    ).toBeChecked();
  });

  it('preserves an edited audience checkbox while adopting refreshed privacy', () => {
    const { rerender } = render(<YouTubePublishingSettings post={post} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Made for kids' }));
    rerender(
      <YouTubePublishingSettings
        post={{
          ...post,
          targetSettings: { privacyStatus: 'unlisted', madeForKids: false },
        }}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Unlisted');
    expect(
      screen.getByRole('checkbox', { name: 'Made for kids' }),
    ).toBeChecked();
  });

  it('reports saved settings separately when refreshing fails', async () => {
    const onSaved = vi.fn().mockRejectedValue(new Error('Refresh unavailable'));
    render(
      <YouTubePublishingSettings
        post={{ ...post, targetSettings: { privacyStatus: 'private' } }}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save YouTube settings' }),
    );
    await waitFor(() =>
      expect(notifyWarning).toHaveBeenCalledWith(
        'YouTube settings saved, but the view could not refresh. Reload to see the latest settings.',
      ),
    );
    expect(notifySuccess).toHaveBeenCalledWith('YouTube settings saved');
    expect(updateTarget).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save YouTube settings' }),
    ).toBeEnabled();
  });

  it('reports a failed save and does not refresh or show success', async () => {
    updateTarget.mockRejectedValueOnce(new Error('Save unavailable'));
    const onSaved = vi.fn();
    render(
      <YouTubePublishingSettings
        post={{ ...post, targetSettings: { privacyStatus: 'private' } }}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save YouTube settings' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Save unavailable',
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyWarning).not.toHaveBeenCalled();
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

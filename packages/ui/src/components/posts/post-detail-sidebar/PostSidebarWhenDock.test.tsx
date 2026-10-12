import { CredentialPlatform } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostSidebarWhenDock from '@ui/posts/post-detail-sidebar/PostSidebarWhenDock';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/posts/post-1',
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ toString: () => '' }),
}));

const post = {
  id: 'post-1',
  platform: CredentialPlatform.INSTAGRAM,
} as unknown as IPost;

const baseProps = {
  browserTimezone: 'Europe/Malta',
  isPublished: false,
  isSavingSchedule: false,
  isScheduleDirty: false,
  onPublishNow: vi.fn(),
  onScheduleChange: vi.fn(),
  onScheduleSave: vi.fn(),
  post,
  scheduleDraft: '',
};

describe('PostSidebarWhenDock', () => {
  it('keeps one direct publish button for non-TikTok targets', () => {
    render(<PostSidebarWhenDock {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Publish now' })).toBeVisible();
    expect(screen.getByTestId('post-when-readiness')).toHaveTextContent(
      'Ready',
    );
    expect(
      screen.queryByRole('button', {
        name: 'More TikTok publishing options',
      }),
    ).not.toBeInTheDocument();
  });

  it('switches to Schedule, disabled until a date is chosen and dirty', async () => {
    const user = userEvent.setup();
    const onScheduleSave = vi.fn();
    const { rerender } = render(
      <PostSidebarWhenDock {...baseProps} onScheduleSave={onScheduleSave} />,
    );

    await user.click(screen.getByRole('tab', { name: 'Schedule' }));

    const scheduleButton = screen.getByRole('button', { name: 'Schedule' });
    expect(scheduleButton).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Publish now' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('post-when-readiness')).toHaveTextContent(
      'Choose a date and time',
    );

    rerender(
      <PostSidebarWhenDock
        {...baseProps}
        isScheduleDirty
        onScheduleSave={onScheduleSave}
        scheduleDraft="2026-10-20T10:00:00.000Z"
      />,
    );

    expect(screen.getByRole('button', { name: 'Schedule' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(onScheduleSave).toHaveBeenCalledTimes(1);
  });

  it('opens in Schedule mode when a schedule already exists', () => {
    render(
      <PostSidebarWhenDock
        {...baseProps}
        scheduleDraft="2026-10-20T10:00:00.000Z"
      />,
    );

    expect(screen.getByRole('tab', { name: 'Schedule' })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('switches to Schedule when an existing schedule loads after the first render', () => {
    const { rerender } = render(
      <PostSidebarWhenDock {...baseProps} scheduleDraft="" />,
    );
    expect(screen.getByRole('tab', { name: 'Now' })).toHaveAttribute(
      'data-state',
      'active',
    );

    rerender(
      <PostSidebarWhenDock
        {...baseProps}
        scheduleDraft="2026-10-20T10:00:00.000Z"
      />,
    );

    expect(screen.getByRole('tab', { name: 'Schedule' })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('keeps the mode the user picked when a schedule loads later', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PostSidebarWhenDock {...baseProps} scheduleDraft="" />,
    );
    await user.click(screen.getByRole('tab', { name: 'Now' }));

    rerender(
      <PostSidebarWhenDock
        {...baseProps}
        scheduleDraft="2026-10-20T10:00:00.000Z"
      />,
    );

    expect(screen.getByRole('tab', { name: 'Now' })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('disables publishing and names the missing item while TikTok is not ready', () => {
    render(
      <PostSidebarWhenDock
        {...baseProps}
        isTikTokReady={false}
        post={{ ...post, platform: CredentialPlatform.TIKTOK } as IPost}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publish now' })).toBeDisabled();
    expect(screen.getByTestId('post-when-readiness')).toHaveTextContent(
      'Finish TikTok settings',
    );
  });

  it('renders TikTok direct publish as the primary half of one split action', () => {
    render(
      <PostSidebarWhenDock
        {...baseProps}
        isTikTokReady
        onPublishViaTikTokApp={vi.fn()}
        post={{ ...post, platform: CredentialPlatform.TIKTOK } as IPost}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Publish to TikTok' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'More TikTok publishing options',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Music Usage Confirmation' }),
    ).toHaveAttribute(
      'href',
      'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en',
    );
    expect(
      screen.queryByRole('button', { name: 'Publish via TikTok App' }),
    ).not.toBeInTheDocument();
  });

  it('explains and triggers the TikTok app handoff from the dropdown', async () => {
    const onPublishViaTikTokApp = vi.fn();
    render(
      <PostSidebarWhenDock
        {...baseProps}
        isTikTokReady
        onPublishViaTikTokApp={onPublishViaTikTokApp}
        post={{ ...post, platform: CredentialPlatform.TIKTOK } as IPost}
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: 'More TikTok publishing options',
      }),
      { button: 0 },
    );

    expect(await screen.findByText('Publish via TikTok App')).toBeVisible();
    expect(
      screen.getByText(
        'Add TikTok-licensed music or make final edits before publishing.',
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByText('Publish via TikTok App'));

    expect(onPublishViaTikTokApp).toHaveBeenCalledTimes(1);
  });

  it('shows Published with a view link and no publish button once published', () => {
    render(
      <PostSidebarWhenDock
        {...baseProps}
        isPublished
        post={
          {
            ...post,
            publicationDate: '2026-10-10T10:00:00.000Z',
            url: 'https://instagram.com/p/abc',
          } as IPost
        }
      />,
    );

    expect(screen.getByText('Published')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'View on Instagram' }),
    ).toHaveAttribute('href', 'https://instagram.com/p/abc');
    expect(
      screen.queryByRole('button', { name: 'Publish now' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Schedule' }),
    ).not.toBeInTheDocument();
  });
});

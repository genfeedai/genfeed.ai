import { fireEvent, render, screen } from '@testing-library/react';
import PostSidebarScheduleCard from '@ui/posts/post-detail-sidebar/PostSidebarScheduleCard';
import { describe, expect, it, vi } from 'vitest';

const baseProps = {
  browserTimezone: 'Europe/Malta',
  isSavingSchedule: false,
  isScheduleDirty: false,
  onPublishNow: vi.fn(),
  onScheduleChange: vi.fn(),
  onScheduleSave: vi.fn(),
  scheduleDraft: '',
};

describe('PostSidebarScheduleCard', () => {
  it('keeps one direct publish button for non-TikTok targets', () => {
    render(<PostSidebarScheduleCard {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Publish now' })).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: 'More TikTok publishing options',
      }),
    ).not.toBeInTheDocument();
  });

  it('renders TikTok direct publish as the primary half of one split action', () => {
    render(
      <PostSidebarScheduleCard
        {...baseProps}
        onPublishViaTikTokApp={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Publish to TikTok' }),
    ).toBeVisible();
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

  it('explains and triggers the TikTok app handoff from the dropdown', () => {
    const onPublishViaTikTokApp = vi.fn();
    render(
      <PostSidebarScheduleCard
        {...baseProps}
        onPublishViaTikTokApp={onPublishViaTikTokApp}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'More TikTok publishing options',
      }),
    );

    expect(screen.getByText('Publish via TikTok App')).toBeVisible();
    expect(
      screen.getByText(
        'Add TikTok-licensed music or make final edits before publishing.',
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByText('Publish via TikTok App'));

    expect(onPublishViaTikTokApp).toHaveBeenCalledTimes(1);
  });
});

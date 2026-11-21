import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Eye } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import PostDetailPublished from '@/features/posts/detail/components/PostDetailPublished';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      performance: 'Performance',
      publishedThread: 'Published thread',
      tiktokInboxDraftThread: 'TikTok Inbox draft',
      'profileVisibility.ariaLabel': 'Public profile',
      'profileVisibility.label': 'Hide from my public Genfeed profile',
      'profileVisibility.hint': 'Only the profile page stops listing it.',
    })[key] ?? key,
}));

describe('PostDetailPublished', () => {
  it('shows the performance numbers above the published thread', () => {
    render(
      <PostDetailPublished
        stats={[
          { accent: 'text-primary', icon: Eye, label: 'Views', value: '1.2K' },
        ]}
        thread={<div>live thread</div>}
        onHiddenFromProfileChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Performance' }),
    ).toHaveTextContent('1.2K');
    expect(
      screen.getByRole('region', { name: 'Published thread' }),
    ).toHaveTextContent('live thread');
  });

  it('leaves out the performance section when there are no numbers', () => {
    render(
      <PostDetailPublished
        onHiddenFromProfileChange={vi.fn()}
        stats={[]}
        thread={<div>live thread</div>}
      />,
    );

    expect(
      screen.queryByRole('region', { name: 'Performance' }),
    ).not.toBeInTheDocument();
  });

  it('labels an Inbox delivery as a draft', () => {
    render(
      <PostDetailPublished
        isTikTokInboxDelivered
        onHiddenFromProfileChange={vi.fn()}
        stats={[]}
        thread="clip"
      />,
    );

    expect(
      screen.getByRole('region', { name: 'TikTok Inbox draft' }),
    ).toHaveTextContent('clip');
  });

  it('hides the post from the profile when the switch is ticked', async () => {
    const onHiddenFromProfileChange = vi.fn();
    render(
      <PostDetailPublished
        onHiddenFromProfileChange={onHiddenFromProfileChange}
        stats={[]}
        thread="clip"
      />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'Hide from my public Genfeed profile',
      }),
    );

    expect(onHiddenFromProfileChange).toHaveBeenCalledWith(true);
  });

  it('shows a hidden post as ticked and offers to show it again', async () => {
    const onHiddenFromProfileChange = vi.fn();
    render(
      <PostDetailPublished
        isHiddenFromProfile
        onHiddenFromProfileChange={onHiddenFromProfileChange}
        stats={[]}
        thread="clip"
      />,
    );

    const checkbox = screen.getByRole('checkbox', {
      name: 'Hide from my public Genfeed profile',
    });
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);

    expect(onHiddenFromProfileChange).toHaveBeenCalledWith(false);
  });
});

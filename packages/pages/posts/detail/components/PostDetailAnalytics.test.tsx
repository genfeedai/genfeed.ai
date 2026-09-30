import type { AnalyticsStat } from '@genfeedai/contracts/interfaces/analytics/analytics-ui.interface';
import PostDetailAnalytics from '@pages/posts/detail/components/PostDetailAnalytics';
import { render, screen } from '@testing-library/react';
import { Eye, Heart } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';

const stats: AnalyticsStat[] = [
  { accent: 'text-info', icon: Eye, label: 'Views', value: '1,204' },
  { accent: 'text-error', icon: Heart, label: 'Likes', value: '87' },
] as unknown as AnalyticsStat[];

describe('PostDetailAnalytics', () => {
  it('renders one card per stat in the grid variant', () => {
    render(<PostDetailAnalytics stats={stats} />);

    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('1,204')).toBeInTheDocument();
    expect(screen.getByText('Likes')).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
  });

  it('renders labels with a colon in the inline variant', () => {
    render(<PostDetailAnalytics stats={stats} variant="inline" />);

    expect(screen.getByText('Views:')).toBeInTheDocument();
    expect(screen.getByText('Likes:')).toBeInTheDocument();
  });

  it('renders the empty state when there are no stats', () => {
    render(<PostDetailAnalytics stats={[]} />);

    expect(screen.getByText('No analytics found')).toBeInTheDocument();
  });

  it('renders a custom empty state label and description', () => {
    render(
      <PostDetailAnalytics
        stats={[]}
        emptyStateLabel="Nothing yet"
        emptyStateDescription="Come back after publishing."
      />,
    );

    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.getByText('Come back after publishing.')).toBeInTheDocument();
  });

  it('renders nothing when empty and the empty state is suppressed', () => {
    const { container } = render(
      <PostDetailAnalytics stats={[]} showEmptyState={false} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('forwards the className to the grid wrapper', () => {
    const { container } = render(
      <PostDetailAnalytics stats={stats} className="custom-analytics" />,
    );

    expect(container.firstChild).toHaveClass('custom-analytics');
  });
});

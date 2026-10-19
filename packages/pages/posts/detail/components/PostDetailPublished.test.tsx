import PostDetailPublished from '@pages/posts/detail/components/PostDetailPublished';
import { render, screen } from '@testing-library/react';
import { Eye } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      performance: 'Performance',
      publishedThread: 'Published thread',
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
    render(<PostDetailPublished stats={[]} thread={<div>live thread</div>} />);

    expect(
      screen.queryByRole('region', { name: 'Performance' }),
    ).not.toBeInTheDocument();
  });
});

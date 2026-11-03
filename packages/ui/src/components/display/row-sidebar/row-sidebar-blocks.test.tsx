import { render, screen } from '@testing-library/react';
import RowSidebarBreakdown from '@ui/display/row-sidebar/RowSidebarBreakdown';
import RowSidebarItemList from '@ui/display/row-sidebar/RowSidebarItemList';
import RowSidebarSection from '@ui/display/row-sidebar/RowSidebarSection';
import RowSidebarStats from '@ui/display/row-sidebar/RowSidebarStats';
import RowSidebarTrend from '@ui/display/row-sidebar/RowSidebarTrend';
import { describe, expect, it } from 'vitest';

describe('RowSidebarSection', () => {
  it('titles its content', () => {
    render(
      <RowSidebarSection title="Platforms">
        <p>Body</p>
      </RowSidebarSection>,
    );

    expect(
      screen.getByRole('heading', { name: 'Platforms' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});

describe('RowSidebarStats', () => {
  it('shows each stat with its hint', () => {
    render(
      <RowSidebarStats
        stats={[
          {
            hint: '+4% vs last period',
            id: 'views',
            label: 'Views',
            value: '1.2K',
          },
          { id: 'posts', label: 'Posts', value: '8' },
        ]}
      />,
    );

    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('1.2K')).toBeInTheDocument();
    expect(screen.getByText('+4% vs last period')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('hides values while loading', () => {
    render(
      <RowSidebarStats
        isLoading
        stats={[{ id: 'views', label: 'Views', value: '1.2K' }]}
      />,
    );

    expect(screen.queryByText('1.2K')).not.toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
  });
});

describe('RowSidebarTrend', () => {
  it('draws a labelled chart when there is a trend', () => {
    render(
      <RowSidebarTrend
        emptyLabel="No data"
        label="Engagement per day"
        points={[1, 4, 2, 8]}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Engagement per day' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No data')).not.toBeInTheDocument();
  });

  it.each([
    ['no points', []],
    ['one point', [5]],
    ['all zeros', [0, 0, 0]],
  ])('shows the empty label for %s', (_name, points) => {
    render(
      <RowSidebarTrend emptyLabel="No data" label="Trend" points={points} />,
    );

    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows neither chart nor empty label while loading', () => {
    render(
      <RowSidebarTrend
        isLoading
        emptyLabel="No data"
        label="Trend"
        points={[]}
      />,
    );

    expect(screen.queryByText('No data')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('RowSidebarBreakdown', () => {
  it('lists each row with its value and a bar', () => {
    render(
      <RowSidebarBreakdown
        emptyLabel="Nothing"
        rows={[
          { id: 'ig', label: 'Instagram', share: 70, value: '700' },
          { id: 'tt', label: 'TikTok', share: 30, value: '300' },
        ]}
      />,
    );

    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('700')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'TikTok' })).toHaveAttribute(
      'aria-valuenow',
      '30',
    );
  });

  it('shows the empty label without rows', () => {
    render(<RowSidebarBreakdown emptyLabel="Nothing" rows={[]} />);

    expect(screen.getByText('Nothing')).toBeInTheDocument();
  });
});

describe('RowSidebarItemList', () => {
  it('links items that have a page and lists the rest plainly', () => {
    render(
      <RowSidebarItemList
        emptyLabel="No posts"
        items={[
          { href: '/posts/1', id: '1', meta: '1.2K views', title: 'Launch' },
          { id: '2', title: 'Draft' },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /Launch/ })).toHaveAttribute(
      'href',
      '/posts/1',
    );
    expect(screen.getByText('1.2K views')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows the empty label without items', () => {
    render(<RowSidebarItemList emptyLabel="No posts" items={[]} />);

    expect(screen.getByText('No posts')).toBeInTheDocument();
  });
});

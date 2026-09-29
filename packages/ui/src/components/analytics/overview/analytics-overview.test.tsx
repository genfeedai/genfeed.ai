import { render, screen } from '@testing-library/react';
import AnalyticsOverview from '@ui/analytics/overview/analytics-overview';
import { describe, expect, it } from 'vitest';

const mockAnalytics = [
  {
    summary: {
      avgEngagementRate: 5.5,
      totalComments: 100,
      totalLikes: 500,
      totalShares: 50,
      totalViews: 10000,
    },
  },
  {
    summary: {
      avgEngagementRate: 6.5,
      totalComments: 200,
      totalLikes: 1000,
      totalShares: 100,
      totalViews: 20000,
    },
  },
];

describe('AnalyticsOverview', () => {
  describe('KPI Items Display', () => {
    it('shows Posts count when showPostsCount is true', () => {
      render(<AnalyticsOverview analytics={mockAnalytics} showPostsCount />);
      expect(screen.getByText('Posts')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows Total Views with formatted number', () => {
      render(<AnalyticsOverview analytics={mockAnalytics} />);
      expect(screen.getByText('Total Views')).toBeInTheDocument();
      // 30000 views formatted as 30.0k
      expect(screen.getByText('30.0k')).toBeInTheDocument();
    });

    it('shows Total Likes', () => {
      render(<AnalyticsOverview analytics={mockAnalytics} />);
      expect(screen.getByText('Total Likes')).toBeInTheDocument();
      // 1500 likes formatted as 1.5k
      expect(screen.getByText('1.5k')).toBeInTheDocument();
    });

    it('shows Comments count', () => {
      render(<AnalyticsOverview analytics={mockAnalytics} />);
      expect(screen.getByText('Comments')).toBeInTheDocument();
      // 300 comments
      expect(screen.getByText('300')).toBeInTheDocument();
    });

    it('shows Shares count', () => {
      render(<AnalyticsOverview analytics={mockAnalytics} />);
      expect(screen.getByText('Shares')).toBeInTheDocument();
      // 150 shares
      expect(screen.getByText('150')).toBeInTheDocument();
    });

    it('shows Avg Engagement as percentage', () => {
      render(<AnalyticsOverview analytics={mockAnalytics} />);
      expect(screen.getByText('Avg Engagement')).toBeInTheDocument();
      // (5.5 + 6.5) / 2 = 6.00%
      expect(screen.getByText('6.00%')).toBeInTheDocument();
    });
  });

  describe('Calculations', () => {
    it('handles single analytics item', () => {
      const analytics = [
        {
          summary: {
            avgEngagementRate: 10.5,
            totalComments: 10,
            totalLikes: 100,
            totalShares: 5,
            totalViews: 1000,
          },
        },
      ];
      render(<AnalyticsOverview analytics={analytics} />);
      expect(screen.getByText('1.0k')).toBeInTheDocument();
      expect(screen.getByText('10.50%')).toBeInTheDocument();
    });
  });

  describe('Grid Configuration', () => {
    it('uses 6 column grid when showPostsCount is true', () => {
      render(<AnalyticsOverview analytics={mockAnalytics} showPostsCount />);
      // Should show 6 KPI items including Posts
      expect(screen.getByText('Posts')).toBeInTheDocument();
      expect(screen.getByText('Total Views')).toBeInTheDocument();
      expect(screen.getByText('Total Likes')).toBeInTheDocument();
      expect(screen.getByText('Comments')).toBeInTheDocument();
      expect(screen.getByText('Shares')).toBeInTheDocument();
      expect(screen.getByText('Avg Engagement')).toBeInTheDocument();
    });

    it('uses 5 column grid when showPostsCount is false', () => {
      render(
        <AnalyticsOverview analytics={mockAnalytics} showPostsCount={false} />,
      );
      // Should show 5 KPI items without Posts
      expect(screen.queryByText('Posts')).not.toBeInTheDocument();
      expect(screen.getByText('Total Views')).toBeInTheDocument();
      expect(screen.getByText('Total Likes')).toBeInTheDocument();
      expect(screen.getByText('Comments')).toBeInTheDocument();
      expect(screen.getByText('Shares')).toBeInTheDocument();
      expect(screen.getByText('Avg Engagement')).toBeInTheDocument();
    });
  });

  describe('Large Numbers', () => {
    it('formats million+ likes correctly', () => {
      const analytics = [
        {
          summary: {
            avgEngagementRate: 0,
            totalComments: 0,
            totalLikes: 2500000,
            totalShares: 0,
            totalViews: 0,
          },
        },
      ];
      render(<AnalyticsOverview analytics={analytics} />);
      // 2.5M likes
      expect(screen.getByText('2.5M')).toBeInTheDocument();
    });
  });
});

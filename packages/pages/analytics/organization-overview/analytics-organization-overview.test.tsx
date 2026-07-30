import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';

describe('AnalyticsOrganizationOverview', () => {
  it('should render without crashing', () => {
    const { container } = render(<AnalyticsOrganizationOverview />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders the four-card organization metric strip without a redundant page title', () => {
    render(<AnalyticsOrganizationOverview />);

    expect(screen.queryByText('Organization Metrics')).not.toBeInTheDocument();
    expect(screen.getByText('Total Brands')).toBeInTheDocument();
    expect(screen.getByText('Total Posts')).toBeInTheDocument();
    expect(screen.getByText('Total Views')).toBeInTheDocument();
    expect(screen.getByText('Total Members')).toBeInTheDocument();
    expect(screen.queryByText('Total Engagement')).not.toBeInTheDocument();
    expect(screen.queryByText('Engagement Rate')).not.toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {});

  it('should apply correct styles and classes', () => {});
});

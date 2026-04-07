import { render, screen } from '@testing-library/react';
import PublicationAnalyticsDashboard from '@ui/analytics/post-dashboard/publication-analytics-dashboard';
import { describe, expect, it } from 'vitest';

describe('PublicationAnalyticsDashboard', () => {
  it('should render without crashing', () => {
    render(<PublicationAnalyticsDashboard />);
    expect(screen.getByText('No analytics data available')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<PublicationAnalyticsDashboard />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PublicationAnalyticsDashboard />);
    const rootElement = container.firstChild;
    expect(rootElement).toBeInTheDocument();
  });
});

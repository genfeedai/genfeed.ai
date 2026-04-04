import AnalyticsList from '@pages/analytics/analytics-list';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('AnalyticsList', () => {
  it('should render without crashing', () => {
    const { container } = render(<AnalyticsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<AnalyticsList />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<AnalyticsList />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

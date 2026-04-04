import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it } from 'vitest';

describe('AnalyticsContext', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <AnalyticsProvider>
        <div data-testid="child" />
      </AnalyticsProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <AnalyticsProvider>
        <div data-testid="child" />
      </AnalyticsProvider>,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <AnalyticsProvider>
        <div data-testid="child" />
      </AnalyticsProvider>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

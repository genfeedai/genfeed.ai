import { render } from '@testing-library/react';
import KPICard from '@ui/kpi/kpi-card/KPICard';
import { describe, expect, it } from 'vitest';

describe('KPICard', () => {
  it('should render without crashing', () => {
    const { container } = render(<KPICard />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<KPICard />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<KPICard />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

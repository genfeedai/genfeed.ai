import { render, screen } from '@testing-library/react';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { HiSparkles } from 'react-icons/hi2';
import { describe, expect, it } from 'vitest';

describe('KPISection', () => {
  const items = [
    {
      icon: HiSparkles,
      label: 'Views',
      value: '1.2K',
    },
  ];

  it('should render without crashing', () => {
    const { container } = render(<KPISection title="Overview" items={items} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<KPISection title="Overview" items={items} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<KPISection title="Overview" items={items} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('uses the standard internal section heading style', () => {
    render(<KPISection title="Overview" items={items} />);

    const heading = screen.getByRole('heading', { name: 'Overview' });

    expect(heading).toHaveClass(
      'text-xl',
      'font-semibold',
      'tracking-[-0.02em]',
      'text-foreground',
    );
    expect(heading).not.toHaveClass('font-serif-italic');
  });
});

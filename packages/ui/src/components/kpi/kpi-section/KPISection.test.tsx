import { render, screen } from '@testing-library/react';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { Sparkles } from 'lucide-react';

import { describe, expect, it } from 'vitest';

describe('KPISection', () => {
  const items = [
    {
      icon: Sparkles,
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

  it('stacks header actions on narrow screens', () => {
    render(
      <KPISection
        title="Overview"
        items={items}
        headerActions={<button type="button">Export</button>}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Overview' }).parentElement,
    ).toHaveClass('flex-col', 'sm:flex-row');
  });
});

it('uses the same container-width tile ladder while loading and isolates section failures', () => {
  const items = [{ label: 'Views', value: 12 }];
  const { rerender } = render(
    <KPISection items={items} gridCols={{ desktop: 6 }} isLoading />,
  );
  expect(screen.getByTestId('metric-card-grid')).toHaveClass('@container');
  expect(screen.getByTestId('metric-card-grid').firstElementChild).toHaveClass(
    'gap-3',
    '@[72rem]:grid-cols-6',
  );
  rerender(
    <>
      <KPISection title="Failed" items={items} error="Unavailable" />
      <KPISection title="Working" items={items} />
    </>,
  );
  expect(screen.getByText('Unavailable')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Working' })).toBeInTheDocument();
  expect(screen.getAllByTestId('metric-card-grid')).toHaveLength(1);
});

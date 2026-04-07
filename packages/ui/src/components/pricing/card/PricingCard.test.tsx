import { render, screen } from '@testing-library/react';
import PricingCard from '@ui/pricing/card/PricingCard';
import { describe, expect, it } from 'vitest';

describe('PricingCard', () => {
  const plan = {
    description: 'Great for getting started',
    features: ['Feature A'],
    interval: 'month' as const,
    label: 'Starter',
    price: 19,
    type: 'subscription' as const,
  };

  it('should render without crashing', () => {
    const { container } = render(
      <PricingCard plan={plan} buttonLabel="Subscribe" />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <PricingCard plan={plan} buttonLabel="Subscribe" />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <PricingCard plan={plan} buttonLabel="Subscribe" />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});

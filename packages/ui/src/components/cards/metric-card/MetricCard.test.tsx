import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import MetricCard from './MetricCard';

describe('MetricCard', () => {
  it('renders label and value with consistent type', () => {
    render(<MetricCard label="Active runs" value="3" />);

    expect(screen.getByText('Active runs')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('hides trend when the prop is omitted', () => {
    const { container } = render(
      <MetricCard label="Pending posts" value="9" />,
    );

    expect(container.textContent).not.toMatch(/%/);
  });

  it('shows trend when a number is provided (including zero)', () => {
    const { rerender } = render(
      <MetricCard label="Users" value="6" trend={-5} />,
    );
    expect(screen.getByText('-5%')).toBeInTheDocument();

    rerender(<MetricCard label="Users" value="6" trend={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();

    rerender(<MetricCard label="Users" value="6" trend={12} />);
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  it('renders optional icon without requiring a different component', () => {
    render(<MetricCard label="Orgs" value="6" icon={Users} />);
    expect(screen.getByText('Orgs')).toBeInTheDocument();
  });

  it('shows a loading skeleton for the value', () => {
    const { container } = render(
      <MetricCard isLoading label="Models" value="10" />,
    );
    expect(screen.queryByText('10')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renders inline appearance without a framed tile', () => {
    render(<MetricCard appearance="inline" label="accounts" value="4" />);

    const card = screen.getByTestId('metric-card');
    expect(card).toHaveAttribute('data-appearance', 'inline');
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('accounts')).toBeInTheDocument();
  });
});

describe('MetricSummary', () => {
  it('joins metrics with separators', async () => {
    const { MetricSummary } = await import('./MetricCard');
    render(
      <MetricSummary
        items={[
          { label: 'accounts', value: '4' },
          { label: 'healthy', value: '2' },
        ]}
      />,
    );

    // Spacing between value/label/separator comes from flex gaps, so the
    // text content itself carries no spaces.
    expect(screen.getByTestId('metric-summary')).toHaveTextContent(
      /4\s*accounts\s*·\s*2\s*healthy/,
    );
  });
});

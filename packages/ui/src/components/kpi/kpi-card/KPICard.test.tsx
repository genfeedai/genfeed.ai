import { render, screen } from '@testing-library/react';
import KPICard from '@ui/kpi/kpi-card/KPICard';
import { describe, expect, it } from 'vitest';

describe('KPICard (MetricCard lg alias)', () => {
  it('renders label and value', () => {
    render(<KPICard label="Total Users" value="6" />);
    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('shows optional trend on the same component', () => {
    render(<KPICard label="Users" value="6" trend={-5} />);
    expect(screen.getByText('-5%')).toBeInTheDocument();
  });

  it('hides trend when omitted', () => {
    render(<KPICard label="Users" value="6" />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

import type { SurfaceSummaryItem } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SurfaceSummaryStrip } from './SurfaceSummaryStrip';

const ITEMS = [
  { label: 'Agents Active', value: '4' },
  { label: 'Tasks In Progress', value: '12' },
  { label: 'Pending Approvals', value: '3' },
  { label: 'Credits Used', value: '980' },
];

describe('SurfaceSummaryStrip', () => {
  it('renders up to four metrics on a standalone page surface', () => {
    render(<SurfaceSummaryStrip items={ITEMS} testId="page-strip" />);

    expect(screen.getByTestId('page-strip')).toBeInTheDocument();
    for (const item of ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  // The one-row / three-card cap is the contract for anything a surface
  // projects into the agent conversation. Enforced here so no call site can
  // widen it by passing a longer list.
  it('truncates to three metrics when projected inline', () => {
    render(
      <SurfaceSummaryStrip
        items={ITEMS}
        testId="inline-strip"
        variant="inline"
      />,
    );

    expect(screen.getByText('Agents Active')).toBeInTheDocument();
    expect(screen.getByText('Tasks In Progress')).toBeInTheDocument();
    expect(screen.getByText('Pending Approvals')).toBeInTheDocument();
    expect(screen.queryByText('Credits Used')).toBeNull();
  });

  it('renders nothing when there are no metrics', () => {
    const { container } = render(
      <SurfaceSummaryStrip items={[]} testId="empty-strip" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows skeletons instead of values while loading', () => {
    render(
      <SurfaceSummaryStrip
        items={[{ isLoading: true, label: 'Agents Active', value: '4' }]}
        testId="loading-strip"
      />,
    );

    expect(screen.getByText('Agents Active')).toBeInTheDocument();
    expect(screen.queryByText('4')).toBeNull();
  });

  it('renders text accents and rejects unsupported runtime accent values', () => {
    const items = [
      {
        accent: '4 running',
        label: 'Supported Accent',
        value: '4',
      },
      {
        accent: <div data-testid="unsupported-accent">Unsupported</div>,
        label: 'Unsupported Accent',
        value: '1',
      },
    ] as unknown as SurfaceSummaryItem[];

    render(<SurfaceSummaryStrip items={items} testId="accent-strip" />);

    expect(screen.getByText('4 running')).toBeInTheDocument();
    expect(screen.queryByTestId('unsupported-accent')).toBeNull();
    expect(screen.getByText('Unsupported Accent')).toBeInTheDocument();
  });
});

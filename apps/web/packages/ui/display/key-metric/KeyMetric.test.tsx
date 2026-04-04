import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KeyMetric from './KeyMetric';

describe('KeyMetric', () => {
  it('renders the label, value, and description', () => {
    render(
      <KeyMetric
        description="All milestone tiers reached"
        label="Next milestone"
        value="Done"
      />,
    );

    expect(screen.getByText('Next milestone')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('All milestone tiers reached')).toBeInTheDocument();
  });
});

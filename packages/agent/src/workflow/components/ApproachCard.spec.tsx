import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Approach } from '../types';
import { ApproachCard } from './ApproachCard';

function makeApproach(overrides: Partial<Approach> = {}): Approach {
  return {
    description: 'Reuse the existing scheduler',
    id: 'approach-1',
    recommended: false,
    title: 'Extend the scheduler',
    tradeoffs: { cons: ['Couples modules'], pros: ['Fast to ship'] },
    ...overrides,
  };
}

describe('ApproachCard', () => {
  it('renders the title, description and every tradeoff', () => {
    render(
      <ApproachCard
        approach={makeApproach({
          tradeoffs: {
            cons: ['Slower', 'More code'],
            pros: ['Cheap', 'Simple'],
          },
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Extend the scheduler')).toBeInTheDocument();
    expect(
      screen.getByText('Reuse the existing scheduler'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cheap')).toBeInTheDocument();
    expect(screen.getByText('Simple')).toBeInTheDocument();
    expect(screen.getByText('Slower')).toBeInTheDocument();
    expect(screen.getByText('More code')).toBeInTheDocument();
  });

  it('shows the recommended badge only when flagged', () => {
    const { rerender } = render(
      <ApproachCard
        approach={makeApproach()}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();

    rerender(
      <ApproachCard
        approach={makeApproach({ recommended: true })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });
});

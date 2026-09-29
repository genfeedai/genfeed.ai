import { AssetScope } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { ScopeSelector } from '@ui/assets/ScopeSelector';
import { describe, expect, it, vi } from 'vitest';

describe('ScopeSelector', () => {
  it('renders the default labeled selector', () => {
    render(<ScopeSelector value={AssetScope.USER} onChange={vi.fn()} />);

    expect(screen.getByText('Access Control')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('applies grouped rounded panel styling for the panel variant', () => {
    const { container } = render(
      <ScopeSelector
        value={AssetScope.USER}
        onChange={vi.fn()}
        variant="panel"
      />,
    );

    const groupedList = container.querySelector('[role="radiogroup"]');

    expect(groupedList).toHaveClass('rounded-2xl');
    expect(groupedList).toHaveClass('border');
    expect(groupedList).toHaveClass('border-border');
    expect(groupedList?.innerHTML).not.toMatch(
      /\b(?:bg|border|divide|text)-(?:black|white)(?:\b|\/|\[)/,
    );
  });
});

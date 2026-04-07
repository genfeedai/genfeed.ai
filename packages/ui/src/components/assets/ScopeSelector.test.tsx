import { AssetScope } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScopeSelector } from '@ui/assets/ScopeSelector';
import { describe, expect, it, vi } from 'vitest';

describe('ScopeSelector', () => {
  it('renders the default labeled selector', () => {
    render(<ScopeSelector value={AssetScope.USER} onChange={vi.fn()} />);

    expect(screen.getByText('Access Control')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('suppresses the selector label when showLabel is false', () => {
    render(
      <ScopeSelector
        value={AssetScope.USER}
        onChange={vi.fn()}
        showLabel={false}
      />,
    );

    expect(screen.queryByText('Access Control')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected scope', () => {
    const onChange = vi.fn();

    render(<ScopeSelector value={AssetScope.USER} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Brand'));

    expect(onChange).toHaveBeenCalledWith(AssetScope.BRAND);
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
  });
});

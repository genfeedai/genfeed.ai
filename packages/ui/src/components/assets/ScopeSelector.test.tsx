import { AssetScope } from '@genfeedai/contracts';
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
    expect(groupedList).toHaveClass('border-border');
    expect(groupedList?.innerHTML).not.toMatch(
      /\b(?:bg|border|divide|text)-(?:black|white)(?:\b|\/|\[)/,
    );
  });

  it('renders the segmented variant as one radio per scope with the active description', () => {
    render(
      <ScopeSelector
        value={AssetScope.BRAND}
        onChange={vi.fn()}
        showLabel={false}
        variant="segmented"
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Brand' })).toBeChecked();
    expect(screen.getByText('Brand members can access')).toBeInTheDocument();
    expect(screen.queryByText('Only you can access')).not.toBeInTheDocument();
  });

  it('selects another scope from the segmented variant and ignores re-pressing the active one', () => {
    const onChange = vi.fn();

    render(
      <ScopeSelector
        value={AssetScope.USER}
        onChange={onChange}
        variant="segmented"
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Private' }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Public' }));
    expect(onChange).toHaveBeenCalledWith(AssetScope.PUBLIC);
  });
});

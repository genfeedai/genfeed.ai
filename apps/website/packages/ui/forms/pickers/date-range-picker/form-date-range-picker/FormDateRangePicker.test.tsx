import { Timeframe } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import FormDateRangePicker from '@ui/forms/pickers/date-range-picker/form-date-range-picker/FormDateRangePicker';

describe('FormDateRangePicker', () => {
  it('should render without crashing', () => {
    const { container } = render(<FormDateRangePicker />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('updates the range when a preset is selected', () => {
    const handleChange = vi.fn();

    render(<FormDateRangePicker onChange={handleChange} />);

    fireEvent.click(screen.getByRole('button', { name: Timeframe.D30 }));

    expect(handleChange).toHaveBeenCalledWith({
      endDate: expect.any(Date),
      startDate: expect.any(Date),
    });
  });

  it('applies the shared field styles to presets and the custom trigger', () => {
    render(<FormDateRangePicker />);

    expect(
      screen.getByRole('button', { name: Timeframe.D7 }).parentElement,
    ).toHaveClass('rounded-lg', 'border', 'border-white/[0.08]');

    const buttons = screen.getAllByRole('button');
    const customTrigger = buttons.find((button) =>
      button.className.includes('justify-start'),
    );

    expect(customTrigger).toHaveClass('rounded-lg');
    expect(customTrigger).toHaveClass('border-white/[0.06]');
  });
});

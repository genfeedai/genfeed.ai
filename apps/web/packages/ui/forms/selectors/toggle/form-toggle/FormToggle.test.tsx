import { fireEvent, render, screen } from '@testing-library/react';
import FormToggle from '@ui/forms/selectors/toggle/form-toggle/FormToggle';
import { describe, expect, it, vi } from 'vitest';

describe('FormToggle', () => {
  it('should render without crashing', () => {
    render(<FormToggle isChecked={false} label="Advanced Mode" />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByText('Advanced Mode')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const onChange = vi.fn();

    render(
      <FormToggle
        isChecked={false}
        label="Advanced Mode"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ checked: true }),
      }),
    );
  });

  it('should apply correct styles and classes', () => {
    render(
      <FormToggle
        isChecked={true}
        label="Advanced Mode"
        switchClassName="data-[state=checked]:bg-[var(--accent-orange)]"
      />,
    );

    expect(screen.getByRole('switch')).toHaveClass(
      'data-[state=checked]:bg-[var(--accent-orange)]',
    );
  });
});

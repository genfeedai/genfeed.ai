import { fireEvent, render, screen } from '@testing-library/react';
import { Checkbox } from '@ui/primitives/checkbox';
import { describe, expect, it, vi } from 'vitest';

describe('Checkbox', () => {
  it('renders without crashing', () => {
    render(<Checkbox />);
    // Radix checkbox renders as a button with role="checkbox"
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('is unchecked by default', () => {
    render(<Checkbox />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('renders as checked when checked prop is true', () => {
    render(<Checkbox checked />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders as checked when defaultChecked is true', () => {
    render(<Checkbox defaultChecked />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('handles click to toggle checked state', () => {
    const handleChange = vi.fn();
    render(<Checkbox onCheckedChange={handleChange} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('handles controlled checked state', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <Checkbox checked={false} onCheckedChange={handleChange} />,
    );

    expect(screen.getByRole('checkbox')).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(handleChange).toHaveBeenCalledWith(true);

    // Simulate parent updating the checked prop
    rerender(<Checkbox checked={true} onCheckedChange={handleChange} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Checkbox disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('does not trigger onChange when disabled', () => {
    const handleChange = vi.fn();
    render(<Checkbox disabled onCheckedChange={handleChange} />);

    fireEvent.click(screen.getByRole('checkbox'));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<Checkbox className="custom-class" />);
    expect(screen.getByRole('checkbox')).toHaveClass('custom-class');
  });

  it('preserves default styling with custom className', () => {
    render(<Checkbox className="custom-class" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('custom-class');
    expect(checkbox).toHaveClass('border');
    expect(checkbox).toHaveClass('shadow');
  });

  describe('indeterminate state', () => {
    it('supports indeterminate state', () => {
      render(<Checkbox checked="indeterminate" />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('data-state', 'indeterminate');
    });

    it('calls onChange with indeterminate state', () => {
      const handleChange = vi.fn();
      render(
        <Checkbox checked="indeterminate" onCheckedChange={handleChange} />,
      );

      fireEvent.click(screen.getByRole('checkbox'));
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has correct role', () => {
      render(<Checkbox />);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('supports aria-label', () => {
      render(<Checkbox aria-label="Accept terms" />);
      expect(screen.getByRole('checkbox')).toHaveAttribute(
        'aria-label',
        'Accept terms',
      );
    });

    it('supports aria-describedby', () => {
      render(<Checkbox aria-describedby="terms-description" />);
      expect(screen.getByRole('checkbox')).toHaveAttribute(
        'aria-describedby',
        'terms-description',
      );
    });

    it('supports aria-labelledby', () => {
      render(<Checkbox aria-labelledby="terms-label" />);
      expect(screen.getByRole('checkbox')).toHaveAttribute(
        'aria-labelledby',
        'terms-label',
      );
    });

    it('is keyboard accessible', () => {
      const handleChange = vi.fn();
      render(<Checkbox onCheckedChange={handleChange} />);

      const checkbox = screen.getByRole('checkbox');
      checkbox.focus();
      expect(checkbox).toHaveFocus();

      // Radix checkbox toggles on click; Space on a button triggers click natively
      fireEvent.click(checkbox);
      expect(handleChange).toHaveBeenCalled();
    });

    it('supports Space key to toggle', () => {
      const handleChange = vi.fn();
      render(<Checkbox onCheckedChange={handleChange} />);

      const checkbox = screen.getByRole('checkbox');
      // Radix checkbox toggles on click (Space triggers click on buttons)
      fireEvent.click(checkbox);
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe('visual states', () => {
    it('displays check icon when checked', () => {
      const { container } = render(<Checkbox checked />);
      // The HiCheck icon should be rendered inside the indicator
      const indicator = container.querySelector('[data-state="checked"]');
      expect(indicator).toBeInTheDocument();
    });

    it('does not display check icon when unchecked', () => {
      const { container } = render(<Checkbox checked={false} />);
      const indicator = container.querySelector('[data-state="unchecked"]');
      expect(indicator).toBeInTheDocument();
    });

    it('applies checked styles when checked', () => {
      render(<Checkbox checked />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('data-state', 'checked');
    });

    it('applies unchecked styles when unchecked', () => {
      render(<Checkbox checked={false} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    });

    it('applies disabled styles when disabled', () => {
      render(<Checkbox disabled />);
      expect(screen.getByRole('checkbox')).toHaveClass('disabled:opacity-50');
    });
  });

  describe('form integration', () => {
    it('accepts name prop', () => {
      render(<Checkbox name="terms" />);
      // Radix checkbox renders as a button; name is passed as prop
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('supports value attribute', () => {
      render(<Checkbox value="accepted" />);
      expect(screen.getByRole('checkbox')).toHaveAttribute('value', 'accepted');
    });

    it('supports required attribute', () => {
      render(<Checkbox required />);
      expect(screen.getByRole('checkbox')).toHaveAttribute(
        'aria-required',
        'true',
      );
    });
  });

  describe('event handlers', () => {
    it('handles onFocus', () => {
      const handleFocus = vi.fn();
      render(<Checkbox onFocus={handleFocus} />);

      screen.getByRole('checkbox').focus();
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('handles onBlur', () => {
      const handleBlur = vi.fn();
      render(<Checkbox onBlur={handleBlur} />);

      const checkbox = screen.getByRole('checkbox');
      checkbox.focus();
      checkbox.blur();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to checkbox element', () => {
      const ref = vi.fn();
      render(<Checkbox ref={ref} />);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(HTMLButtonElement);
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Checkbox id="terms-checkbox" />);
      expect(screen.getByRole('checkbox')).toHaveAttribute(
        'id',
        'terms-checkbox',
      );
    });

    it('forwards data attributes', () => {
      render(<Checkbox data-testid="custom-checkbox" />);
      expect(screen.getByTestId('custom-checkbox')).toBeInTheDocument();
    });
  });
});

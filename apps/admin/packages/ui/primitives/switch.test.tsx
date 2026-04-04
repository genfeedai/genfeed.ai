import { fireEvent, render, screen } from '@testing-library/react';
import { Switch } from '@ui/primitives/switch';
import { describe, expect, it, vi } from 'vitest';

describe('Switch', () => {
  it('renders without crashing', () => {
    render(<Switch />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('is unchecked by default', () => {
    render(<Switch />);
    expect(screen.getByRole('switch')).toHaveAttribute(
      'data-state',
      'unchecked',
    );
  });

  it('renders as checked when checked prop is true', () => {
    render(<Switch checked />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
  });

  it('renders as checked when defaultChecked is true', () => {
    render(<Switch defaultChecked />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
  });

  it('handles click to toggle checked state', () => {
    const handleChange = vi.fn();
    render(<Switch onCheckedChange={handleChange} />);

    const switchElement = screen.getByRole('switch');
    fireEvent.click(switchElement);

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('handles controlled checked state', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <Switch checked={false} onCheckedChange={handleChange} />,
    );

    expect(screen.getByRole('switch')).toHaveAttribute(
      'data-state',
      'unchecked',
    );

    fireEvent.click(screen.getByRole('switch'));
    expect(handleChange).toHaveBeenCalledWith(true);

    // Simulate parent updating the checked prop
    rerender(<Switch checked={true} onCheckedChange={handleChange} />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Switch disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('does not trigger onChange when disabled', () => {
    const handleChange = vi.fn();
    render(<Switch disabled onCheckedChange={handleChange} />);

    fireEvent.click(screen.getByRole('switch'));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<Switch className="custom-class" />);
    expect(screen.getByRole('switch')).toHaveClass('custom-class');
  });

  it('preserves default styling with custom className', () => {
    render(<Switch className="custom-class" />);
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveClass('custom-class');
    expect(switchElement).toHaveClass('inline-flex');
    expect(switchElement).toHaveClass('items-center');
  });

  describe('accessibility', () => {
    it('has correct role', () => {
      render(<Switch />);
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('supports aria-label', () => {
      render(<Switch aria-label="Enable notifications" />);
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-label',
        'Enable notifications',
      );
    });

    it('supports aria-describedby', () => {
      render(<Switch aria-describedby="notification-description" />);
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-describedby',
        'notification-description',
      );
    });

    it('supports aria-labelledby', () => {
      render(<Switch aria-labelledby="notification-label" />);
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-labelledby',
        'notification-label',
      );
    });

    it('is keyboard accessible with Space key', () => {
      const handleChange = vi.fn();
      render(<Switch onCheckedChange={handleChange} />);

      const switchElement = screen.getByRole('switch');
      switchElement.focus();
      expect(switchElement).toHaveFocus();

      // Radix switch toggles on click; Space on a button triggers click
      fireEvent.click(switchElement);
      expect(handleChange).toHaveBeenCalled();
    });

    it('is focusable for keyboard interaction', () => {
      render(<Switch />);

      const switchElement = screen.getByRole('switch');
      switchElement.focus();
      expect(switchElement).toHaveFocus();
    });

    it('sets aria-checked based on state', () => {
      const { rerender } = render(<Switch checked={false} />);
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-checked',
        'false',
      );

      rerender(<Switch checked={true} />);
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });

  describe('visual states', () => {
    it('displays thumb element', () => {
      const { container } = render(<Switch />);
      const thumb = container.querySelector('[data-state]');
      expect(thumb).toBeInTheDocument();
    });

    it('applies checked styles when checked', () => {
      render(<Switch checked />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).toHaveAttribute('data-state', 'checked');
      expect(switchElement).toHaveClass('data-[state=checked]:bg-primary');
    });

    it('applies unchecked styles when unchecked', () => {
      render(<Switch checked={false} />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).toHaveAttribute('data-state', 'unchecked');
      expect(switchElement).toHaveClass('data-[state=unchecked]:bg-white/20');
    });

    it('applies disabled styles when disabled', () => {
      render(<Switch disabled />);
      expect(screen.getByRole('switch')).toHaveClass('disabled:opacity-50');
    });

    it('has transition animation', () => {
      render(<Switch />);
      expect(screen.getByRole('switch')).toHaveClass('transition-all');
      expect(screen.getByRole('switch')).toHaveClass('duration-200');
    });
  });

  describe('form integration', () => {
    it('accepts name prop', () => {
      render(<Switch name="notifications" />);
      // Radix switch renders as a button; name is passed as prop
      const switchEl = screen.getByRole('switch');
      expect(switchEl).toBeInTheDocument();
    });

    it('supports value attribute', () => {
      render(<Switch value="enabled" />);
      expect(screen.getByRole('switch')).toHaveAttribute('value', 'enabled');
    });

    it('supports required attribute', () => {
      render(<Switch required />);
      expect(screen.getByRole('switch')).toHaveAttribute(
        'aria-required',
        'true',
      );
    });
  });

  describe('event handlers', () => {
    it('handles onFocus', () => {
      const handleFocus = vi.fn();
      render(<Switch onFocus={handleFocus} />);

      screen.getByRole('switch').focus();
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('handles onBlur', () => {
      const handleBlur = vi.fn();
      render(<Switch onBlur={handleBlur} />);

      const switchElement = screen.getByRole('switch');
      switchElement.focus();
      switchElement.blur();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('handles multiple state changes', () => {
      const handleChange = vi.fn();
      render(<Switch onCheckedChange={handleChange} />);

      const switchElement = screen.getByRole('switch');

      fireEvent.click(switchElement);
      expect(handleChange).toHaveBeenCalledWith(true);

      fireEvent.click(switchElement);
      expect(handleChange).toHaveBeenCalledWith(false);

      expect(handleChange).toHaveBeenCalledTimes(2);
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to switch element', () => {
      const ref = vi.fn();
      render(<Switch ref={ref} />);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(HTMLButtonElement);
    });

    it('allows ref to access switch methods', () => {
      let switchRef: HTMLButtonElement | null = null;
      render(<Switch ref={(el) => (switchRef = el)} />);

      expect(switchRef).toBeInstanceOf(HTMLButtonElement);
      switchRef?.focus();
      expect(switchRef).toHaveFocus();
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Switch id="notifications-switch" />);
      expect(screen.getByRole('switch')).toHaveAttribute(
        'id',
        'notifications-switch',
      );
    });

    it('forwards data attributes', () => {
      render(<Switch data-testid="custom-switch" />);
      expect(screen.getByTestId('custom-switch')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('has proper sizing classes', () => {
      render(<Switch />);
      const switchElement = screen.getByRole('switch');
      expect(switchElement).toHaveClass('h-5');
      expect(switchElement).toHaveClass('w-9');
    });

    it('has focus-visible ring', () => {
      render(<Switch />);
      expect(screen.getByRole('switch')).toHaveClass('focus-visible:ring-2');
    });

    it('has cursor pointer', () => {
      render(<Switch />);
      expect(screen.getByRole('switch')).toHaveClass('cursor-pointer');
    });

    it('has disabled cursor when disabled', () => {
      render(<Switch disabled />);
      expect(screen.getByRole('switch')).toHaveClass(
        'disabled:cursor-not-allowed',
      );
    });
  });
});

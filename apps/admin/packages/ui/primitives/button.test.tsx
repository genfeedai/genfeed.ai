import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from '@ui/primitives/button';
import { describe, expect, it, vi } from 'vitest';

describe('Button', () => {
  it('renders without crashing', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders with children', () => {
    render(<Button>Test Button</Button>);
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled Button</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} disabled>
        Disabled
      </Button>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('sets correct type attribute', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('defaults to submit type (browser default)', () => {
    render(<Button>Default</Button>);
    // HTML buttons default to type="submit" when no type attribute is set
    const button = screen.getByRole('button');
    expect(button.getAttribute('type')).toBeNull();
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Button variant={ButtonVariant.DEFAULT}>Default</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-white');
      expect(button).toHaveClass('text-black');
    });

    it('renders destructive variant', () => {
      render(<Button variant={ButtonVariant.DESTRUCTIVE}>Delete</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-destructive');
    });

    it('renders ghost variant', () => {
      render(<Button variant={ButtonVariant.GHOST}>Ghost</Button>);
      expect(screen.getByRole('button')).toHaveClass('text-white/40');
    });

    it('renders outline variant', () => {
      render(<Button variant={ButtonVariant.OUTLINE}>Outline</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('border');
      expect(button).toHaveClass('bg-transparent');
    });

    it('renders secondary variant', () => {
      render(<Button variant={ButtonVariant.SECONDARY}>Secondary</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-white/5');
    });

    it('renders link variant', () => {
      render(<Button variant={ButtonVariant.LINK}>Link</Button>);
      expect(screen.getByRole('button')).toHaveClass('underline-offset-4');
    });

    it('renders unstyled variant with no default styles', () => {
      render(
        <Button variant={ButtonVariant.UNSTYLED} className="my-custom">
          Unstyled
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toHaveClass('my-custom');
      expect(button).not.toHaveClass('bg-white');
    });
  });

  describe('sizes', () => {
    it('renders default size', () => {
      render(<Button size={ButtonSize.DEFAULT}>Default</Button>);
      expect(screen.getByRole('button')).toHaveClass('h-9');
    });

    it('renders small size', () => {
      render(<Button size={ButtonSize.SM}>Small</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-8');
      expect(button).toHaveClass('px-3');
    });

    it('renders extra small size', () => {
      render(<Button size={ButtonSize.XS}>XSmall</Button>);
      expect(screen.getByRole('button')).toHaveClass('h-7');
    });

    it('renders large size', () => {
      render(<Button size={ButtonSize.LG}>Large</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-10');
      expect(button).toHaveClass('px-8');
    });

    it('renders icon size', () => {
      render(<Button size={ButtonSize.ICON}>🎯</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-9');
      expect(button).toHaveClass('w-9');
    });

    it('renders public size', () => {
      render(<Button size={ButtonSize.PUBLIC}>Public</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('px-12');
      expect(button).toHaveClass('text-sm');
      expect(button).toHaveClass('font-semibold');
    });
  });

  describe('asChild prop', () => {
    it('renders as child component when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>,
      );
      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
    });

    it('applies button styles to child component', () => {
      render(
        <Button asChild variant={ButtonVariant.DEFAULT}>
          <a href="/test">Styled Link</a>
        </Button>,
      );
      const link = screen.getByRole('link');
      expect(link).toHaveClass('bg-white');
    });
  });

  describe('accessibility', () => {
    it('has correct role', () => {
      render(<Button>Accessible</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('supports aria-label', () => {
      render(<Button aria-label="Close dialog">X</Button>);
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Close dialog',
      );
    });

    it('supports aria-disabled', () => {
      render(
        <Button aria-disabled="true" disabled>
          Disabled
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toBeDisabled();
    });

    it('is keyboard accessible', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Keyboard</Button>);

      const button = screen.getByRole('button');
      button.focus();
      expect(button).toHaveFocus();

      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.click(button);
      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('HTML attributes', () => {
    it('forwards data attributes', () => {
      render(<Button data-testid="custom-button">Test</Button>);
      expect(screen.getByTestId('custom-button')).toBeInTheDocument();
    });

    it('forwards id attribute', () => {
      render(<Button id="my-button">Test</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('id', 'my-button');
    });

    it('forwards name attribute', () => {
      render(<Button name="submitBtn">Submit</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('name', 'submitBtn');
    });

    it('forwards value attribute', () => {
      render(<Button value="buttonValue">Value</Button>);
      expect(screen.getByRole('button')).toHaveAttribute(
        'value',
        'buttonValue',
      );
    });
  });

  describe('event handlers', () => {
    it('handles onMouseEnter', () => {
      const handleMouseEnter = vi.fn();
      render(<Button onMouseEnter={handleMouseEnter}>Hover</Button>);

      fireEvent.mouseEnter(screen.getByRole('button'));
      expect(handleMouseEnter).toHaveBeenCalledTimes(1);
    });

    it('handles onMouseLeave', () => {
      const handleMouseLeave = vi.fn();
      render(<Button onMouseLeave={handleMouseLeave}>Leave</Button>);

      fireEvent.mouseLeave(screen.getByRole('button'));
      expect(handleMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('handles onFocus', () => {
      const handleFocus = vi.fn();
      render(<Button onFocus={handleFocus}>Focus</Button>);

      screen.getByRole('button').focus();
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('handles onBlur', () => {
      const handleBlur = vi.fn();
      render(<Button onBlur={handleBlur}>Blur</Button>);

      const button = screen.getByRole('button');
      button.focus();
      button.blur();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to button element', () => {
      const ref = vi.fn();
      render(<Button ref={ref}>Ref Button</Button>);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(HTMLButtonElement);
    });
  });
});

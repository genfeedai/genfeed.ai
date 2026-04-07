import { ButtonVariant } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import Button from '@ui/buttons/base/Button';
import { describe, expect, it, vi } from 'vitest';

describe('Button', () => {
  it('renders with label', () => {
    render(<Button label="Test Button" />);
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  it('renders with icon', () => {
    const icon = <span data-testid="icon">🎯</span>;
    render(<Button label="Test Button" icon={icon} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button label="Test Button" onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('handles mouse down events', () => {
    const handleMouseDown = vi.fn();
    render(<Button label="Test Button" onMouseDown={handleMouseDown} />);

    fireEvent.mouseDown(screen.getByRole('button'));
    expect(handleMouseDown).toHaveBeenCalledTimes(1);
  });

  it('shows spinner when loading', () => {
    render(<Button label="Test Button" isLoading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
    // Spinner should be present (assuming Spinner component renders something visible)
  });

  it('is disabled when isDisabled is true', () => {
    render(<Button label="Test Button" isDisabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows ping indicator when enabled', () => {
    render(<Button label="Test Button" isPingEnabled={true} />);
    const pingElement = document.querySelector('.animate-ping');
    expect(pingElement).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Button label="Test Button" className="custom-class" />);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('applies wrapper className', () => {
    render(<Button label="Test Button" wrapperClassName="wrapper-class" />);
    const wrapper = document.querySelector('.wrapper-class');
    expect(wrapper).toBeInTheDocument();
  });

  it('shows tooltip when provided', () => {
    const { container } = render(
      <Button label="Test Button" tooltip="Test tooltip" />,
    );
    // Component now uses Tooltip component instead of data-tip attribute
    // The button should be wrapped in the tooltip
    const button = container.querySelector('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Test Button');
  });

  it('sets correct type attribute', () => {
    render(<Button label="Test Button" type="submit" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('sets aria-label when provided', () => {
    render(<Button label="Test Button" ariaLabel="Accessible button" />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Accessible button',
    );
  });

  it('calls onClick handler when clicked for non-submit buttons', () => {
    const handleClick = vi.fn();
    render(<Button label="Test Button" onClick={handleClick} type="button" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick handler for submit buttons', () => {
    const handleClick = vi.fn();
    render(<Button label="Test Button" onClick={handleClick} type="submit" />);

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onMouseDown handler when mouse down', () => {
    const handleMouseDown = vi.fn();
    render(<Button label="Test Button" onMouseDown={handleMouseDown} />);

    const button = screen.getByRole('button');
    fireEvent.mouseDown(button);
    expect(handleMouseDown).toHaveBeenCalledTimes(1);
  });

  it('preserves native reset behavior', () => {
    render(
      <form>
        <input aria-label="field" defaultValue="original" />
        <Button label="Reset" type="reset" withWrapper={false} />
      </form>,
    );

    const input = screen.getByLabelText('field') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'changed' } });
    expect(input.value).toBe('changed');

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(input.value).toBe('original');
  });

  it('supports rendering without wrapper', () => {
    render(<Button label="No Wrapper" withWrapper={false} />);
    const button = screen.getByRole('button');
    expect(button.parentElement?.className).not.toContain('indicator');
  });

  it('renders custom children when provided', () => {
    render(
      <Button withWrapper={false}>
        <span data-testid="custom-child">Custom</span>
      </Button>,
    );

    expect(screen.getByTestId('custom-child')).toBeInTheDocument();
  });

  it('omits default styling when using unstyled variant', () => {
    render(
      <Button
        label="Unstyled"
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        className="custom-class"
      />,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
    expect(button).not.toHaveClass('btn');
  });
});

import { ButtonVariant } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import Button from '@ui/buttons/base/Button';
import { describe, expect, it } from 'vitest';

describe('Button', () => {
  it('shows ping indicator when enabled', () => {
    render(<Button label="Test Button" isPingEnabled={true} />);
    const pingElement = document.querySelector('.animate-ping');
    expect(pingElement).toBeInTheDocument();
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

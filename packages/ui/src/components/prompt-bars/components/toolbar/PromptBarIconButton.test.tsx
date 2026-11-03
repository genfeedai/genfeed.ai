import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarIconButton from '@ui/prompt-bars/components/toolbar/PromptBarIconButton';
import { describe, expect, it, vi } from 'vitest';

describe('PromptBarIconButton', () => {
  it('renders an accessible icon button and calls onClick', () => {
    const onClick = vi.fn();
    render(
      <PromptBarIconButton
        ariaLabel="Add style references"
        icon={<svg aria-hidden="true" />}
        onClick={onClick}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Add style references' }),
    );
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    render(
      <PromptBarIconButton
        ariaLabel="Attach"
        icon={<svg aria-hidden="true" />}
        isDisabled
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: 'Attach' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes a wrapping trigger its attributes through', () => {
    render(
      <PromptBarIconButton
        aria-expanded={false}
        aria-haspopup="dialog"
        ariaLabel="Settings"
        icon={<svg aria-hidden="true" />}
      />,
    );

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });
});

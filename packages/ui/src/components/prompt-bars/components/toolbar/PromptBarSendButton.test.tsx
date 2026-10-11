import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import { describe, expect, it, vi } from 'vitest';

describe('PromptBarSendButton', () => {
  it('renders an accessible send button and calls onClick', () => {
    const onClick = vi.fn();
    render(<PromptBarSendButton ariaLabel="Send message" onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    render(
      <PromptBarSendButton
        ariaLabel="Send message"
        isDisabled
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: 'Send message' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables the button while loading', () => {
    render(
      <PromptBarSendButton ariaLabel="Save" isLoading onClick={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('sizes the button by toolbar density', () => {
    const { rerender } = render(
      <PromptBarSendButton
        ariaLabel="Send"
        density="compact"
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass('size-8');

    rerender(<PromptBarSendButton ariaLabel="Send" onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveClass('size-9');
  });

  it('exposes the blocked state and test id', () => {
    render(
      <PromptBarSendButton
        ariaLabel="Generate"
        isAriaDisabled
        onClick={vi.fn()}
        testId="send"
      />,
    );

    expect(screen.getByTestId('send')).toHaveAttribute('aria-disabled', 'true');
  });
});

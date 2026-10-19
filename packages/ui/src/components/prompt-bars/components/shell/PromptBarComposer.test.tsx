import { fireEvent, render, screen } from '@testing-library/react';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import { describe, expect, it, vi } from 'vitest';

describe('PromptBarComposer', () => {
  it('owns the shared surface, attachment tray slot, and body inset', () => {
    render(
      <PromptBarComposer beforeBody={<div>References</div>}>
        <div>Editor</div>
      </PromptBarComposer>,
    );

    expect(screen.getByTestId('prompt-bar-composer')).toHaveClass(
      'rounded-[var(--radius-workspace-composer)]',
      'bg-background/70',
      'border',
      'border-border-strong/70',
      'backdrop-blur-xl',
    );
    expect(screen.getByTestId('prompt-bar-composer').className).not.toMatch(
      /(^|\s)shadow-/,
    );
    expect(screen.getByText('References')).toBeInTheDocument();
    expect(screen.getByTestId('prompt-bar-body')).toHaveTextContent('Editor');
  });

  it('forwards compact density and caller-specific shell attributes', () => {
    render(
      <PromptBarComposer
        data-testid="agent-composer"
        density="compact"
        bodyClassName="custom-body"
      >
        Editor
      </PromptBarComposer>,
    );

    expect(screen.getByTestId('agent-composer')).toHaveAttribute(
      'data-prompt-bar-composer',
    );
    expect(screen.getByTestId('prompt-bar-body')).toHaveClass(
      'px-2.5',
      'custom-body',
    );
  });

  it('rests as one line and opens on a press', () => {
    const onExpand = vi.fn();
    render(
      <PromptBarComposer
        beforeBody={<div>References</div>}
        isResting
        onExpand={onExpand}
      >
        <div data-prompt-editor="">Editor</div>
      </PromptBarComposer>,
    );

    expect(screen.getByTestId('prompt-bar-composer')).toHaveAttribute(
      'data-resting',
      'true',
    );
    expect(screen.queryByText('References')).toBeNull();
    expect(screen.getByTestId('prompt-bar-body')).toHaveClass('flex');

    fireEvent.pointerDown(screen.getByText('Editor'));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('stays open while a banner is showing', () => {
    render(
      <PromptBarComposer banner={<p>Draft not saved</p>} isResting>
        Editor
      </PromptBarComposer>,
    );

    expect(screen.getByTestId('prompt-bar-composer')).not.toHaveAttribute(
      'data-resting',
    );
  });
});

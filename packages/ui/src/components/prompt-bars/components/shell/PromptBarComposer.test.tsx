import { render, screen } from '@testing-library/react';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import { describe, expect, it } from 'vitest';

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
      'shadow-composer',
      'backdrop-blur-xl',
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
});

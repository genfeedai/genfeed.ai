import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@ui/primitives/tooltip';
import PromptBarEnhanceControls from '@ui/prompt-bars/components/toolbar/PromptBarEnhanceControls';
import { describe, expect, it, vi } from 'vitest';

const LABELS = {
  cancelAria: 'Cancel enhancing prompt',
  enhanceAria: 'Enhance prompt',
  enhanceLabel: 'Enhance',
  undoAria: 'Undo prompt enhancement',
  undoLabel: 'Undo',
};

function renderControls(
  overrides: Partial<Parameters<typeof PromptBarEnhanceControls>[0]> = {},
) {
  const handlers = {
    onCancel: vi.fn(),
    onEnhance: vi.fn(),
    onUndo: vi.fn(),
  };
  render(
    <TooltipProvider>
      <PromptBarEnhanceControls
        isEnhancing={false}
        labels={LABELS}
        {...handlers}
        {...overrides}
      />
    </TooltipProvider>,
  );
  return handlers;
}

describe('PromptBarEnhanceControls', () => {
  it('shows a labelled Enhance chip that rewrites the prompt', () => {
    const { onEnhance } = renderControls({ onUndo: undefined });

    const enhance = screen.getByRole('button', { name: 'Enhance prompt' });
    expect(enhance).toHaveTextContent('Enhance');
    fireEvent.click(enhance);
    expect(onEnhance).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('disables Enhance for an empty prompt', () => {
    renderControls({ isDisabled: true });

    expect(
      screen.getByRole('button', { name: 'Enhance prompt' }),
    ).toBeDisabled();
  });

  it('offers Undo once the prompt was enhanced', () => {
    const { onUndo } = renderControls();

    fireEvent.click(
      screen.getByRole('button', { name: 'Undo prompt enhancement' }),
    );
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('turns into a clickable Cancel while enhancing, even when disabled', () => {
    const { onCancel, onEnhance } = renderControls({
      isDisabled: true,
      isEnhancing: true,
    });

    const cancel = screen.getByRole('button', {
      name: 'Cancel enhancing prompt',
    });
    expect(cancel).toBeEnabled();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onEnhance).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });
});

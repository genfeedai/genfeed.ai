import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { SimpleTooltip, TooltipProvider } from './tooltip';

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function moveOver(element: HTMLElement) {
  fireEvent.pointerMove(element, { pointerType: 'mouse' });
}

describe('shared tooltip interactions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares the skip-delay window between button and standalone tooltips', async () => {
    vi.useFakeTimers();
    render(
      <TooltipProvider delayDuration={200} skipDelayDuration={300}>
        <Button withWrapper={false} tooltip="First hint">
          First action
        </Button>
        <SimpleTooltip label="Second hint">
          <button type="button">Second action</button>
        </SimpleTooltip>
      </TooltipProvider>,
    );
    const first = screen.getByRole('button', { name: 'First action' });
    const second = screen.getByRole('button', { name: 'Second action' });
    moveOver(first);
    await advance(100);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await advance(120);
    expect(screen.getByRole('tooltip')).toHaveTextContent('First hint');
    fireEvent.pointerLeave(first, { pointerType: 'mouse' });
    fireEvent.pointerMove(document.body, { clientX: 1000, clientY: 1000 });
    moveOver(second);
    await advance(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Second hint');
    expect(second).toHaveAttribute('data-state', 'instant-open');
  });

  it('opens immediately on focus and dismisses with Escape', async () => {
    render(
      <Button withWrapper={false} tooltip="Keyboard hint">
        Action
      </Button>,
    );
    const trigger = screen.getByRole('button', { name: 'Action' });
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Keyboard hint',
    );
    expect(trigger).toHaveAttribute('data-state', 'instant-open');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('leaves disabled tooltip content absent', () => {
    render(
      <SimpleTooltip isDisabled label="Hidden hint">
        <button type="button">Action</button>
      </SimpleTooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Action' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

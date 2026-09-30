import { AgentResizeHandle } from '@genfeedai/agent/components/AgentResizeHandle';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('AgentResizeHandle', () => {
  afterEach(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  it('renders an accessible slider', () => {
    render(<AgentResizeHandle onResize={vi.fn()} onResizeEnd={vi.fn()} />);

    const handle = screen.getByRole('slider', { name: 'Resize agent panel' });

    expect(handle).toBeInTheDocument();
    expect(handle).toHaveAttribute('aria-valuemin', '280');
    expect(handle).toHaveAttribute('aria-valuemax', '500');
  });

  it('reports the inverted delta while dragging', () => {
    const onResize = vi.fn();
    render(<AgentResizeHandle onResize={onResize} onResizeEnd={vi.fn()} />);

    const handle = screen.getByRole('slider');
    fireEvent.mouseDown(handle, { clientX: 400 });

    // Dragging left widens the panel, so the delta is start - current.
    fireEvent.mouseMove(document, { clientX: 380 });
    expect(onResize).toHaveBeenCalledWith(20);

    // The origin moves with the pointer, so deltas stay incremental.
    fireEvent.mouseMove(document, { clientX: 375 });
    expect(onResize).toHaveBeenLastCalledWith(5);
  });

  it('locks the body cursor during a drag and restores it after', () => {
    const onResizeEnd = vi.fn();
    render(<AgentResizeHandle onResize={vi.fn()} onResizeEnd={onResizeEnd} />);

    fireEvent.mouseDown(screen.getByRole('slider'), { clientX: 400 });
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');

    fireEvent.mouseUp(document);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });

  it('detaches its listeners once the drag ends', () => {
    const onResize = vi.fn();
    render(<AgentResizeHandle onResize={onResize} onResizeEnd={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole('slider'), { clientX: 400 });
    fireEvent.mouseUp(document);
    onResize.mockClear();

    fireEvent.mouseMove(document, { clientX: 100 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('resets the width on double click when a handler is supplied', () => {
    const onResetWidth = vi.fn();
    render(
      <AgentResizeHandle
        onResize={vi.fn()}
        onResizeEnd={vi.fn()}
        onResetWidth={onResetWidth}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('slider'));

    expect(onResetWidth).toHaveBeenCalledTimes(1);
  });

  it('ignores double click when no reset handler is supplied', () => {
    render(<AgentResizeHandle onResize={vi.fn()} onResizeEnd={vi.fn()} />);

    expect(() =>
      fireEvent.doubleClick(screen.getByRole('slider')),
    ).not.toThrow();
  });
});

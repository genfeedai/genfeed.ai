import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SelectionToolbar from './SelectionToolbar';

describe('SelectionToolbar', () => {
  it('shows selection feedback and shares clear behavior across caller actions', async () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <SelectionToolbar count={2} label="2 selected" onClear={onClear}>
        <span>Caller action</span>
      </SelectionToolbar>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 selected');
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear selection' }),
    );
    expect(onClear).toHaveBeenCalledOnce();
    rerender(
      <SelectionToolbar count={0} label="0 selected" onClear={onClear}>
        <span>Caller action</span>
      </SelectionToolbar>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
  it('keeps the live count mounted through the first selection', () => {
    const { rerender } = render(
      <SelectionToolbar count={0} label="0 selected" onClear={() => {}}>
        Actions
      </SelectionToolbar>,
    );
    const status = screen.getByRole('status');
    rerender(
      <SelectionToolbar count={1} label="1 selected" onClear={() => {}}>
        Actions
      </SelectionToolbar>,
    );
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent('1 selected');
  });
});

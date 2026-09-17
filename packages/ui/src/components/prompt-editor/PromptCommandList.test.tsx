import '@testing-library/jest-dom/vitest';
import type { PromptCommand } from '@genfeedai/props/prompt-bars/prompt-command.props';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PromptCommandList } from '@ui/prompt-editor/PromptCommandList';
import { createRef, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { PromptCommandListHandle } from './PromptCommandList';

const ITEMS: PromptCommand[] = [
  {
    actionName: 'create',
    description: 'New content in Studio',
    kind: 'action',
    label: 'Create',
    name: 'create',
  },
  {
    description: 'Get grilled on your brand voice',
    iconKey: 'writing',
    kind: 'skill',
    label: 'Interview',
    name: 'interview',
    skillSlug: 'brand-interview',
  },
  {
    description: 'Pick the right model',
    kind: 'skill',
    label: 'Model Selector',
    name: 'model-selector',
    skillSlug: 'model-selector',
  },
];

/**
 * The popup re-renders between real keystrokes, so each press has to flush
 * before the next one reads the handle.
 */
function pressKey(ref: RefObject<PromptCommandListHandle | null>, key: string) {
  let handled = false;
  act(() => {
    handled =
      ref.current?.onKeyDown({ event: { key } as KeyboardEvent }) ?? false;
  });
  return handled;
}

describe('PromptCommandList', () => {
  it('renders every command by its slash name and description', () => {
    render(<PromptCommandList command={vi.fn()} items={ITEMS} />);

    expect(screen.getByText('/create')).toBeInTheDocument();
    expect(screen.getByText('/interview')).toBeInTheDocument();
    expect(screen.getByText('Get grilled on your brand voice')).toBeVisible();
  });

  it('selects the clicked command', () => {
    const command = vi.fn();
    render(<PromptCommandList command={command} items={ITEMS} />);

    fireEvent.click(screen.getByText('/model-selector'));

    expect(command).toHaveBeenCalledWith(ITEMS[2]);
  });

  it('walks the list with the arrow keys and selects with Enter', () => {
    const command = vi.fn();
    const ref = createRef<PromptCommandListHandle>();
    render(<PromptCommandList command={command} items={ITEMS} ref={ref} />);

    expect(pressKey(ref, 'ArrowDown')).toBe(true);
    expect(pressKey(ref, 'Enter')).toBe(true);

    expect(command).toHaveBeenCalledWith(ITEMS[1]);
  });

  it('wraps from the first row to the last', () => {
    const command = vi.fn();
    const ref = createRef<PromptCommandListHandle>();
    render(<PromptCommandList command={command} items={ITEMS} ref={ref} />);

    pressKey(ref, 'ArrowUp');
    pressKey(ref, 'Enter');

    expect(command).toHaveBeenCalledWith(ITEMS[2]);
  });

  it('leaves other keys to the editor', () => {
    const ref = createRef<PromptCommandListHandle>();
    render(<PromptCommandList command={vi.fn()} items={ITEMS} ref={ref} />);

    expect(pressKey(ref, 'a')).toBe(false);
  });

  it('shows an empty state rather than a blank popup', () => {
    render(
      <PromptCommandList
        command={vi.fn()}
        emptyLabel="No skills here yet"
        items={[]}
      />,
    );

    expect(screen.getByText('No skills here yet')).toBeVisible();
    expect(screen.queryByTestId('prompt-command-list')).not.toBeInTheDocument();
  });

  it('does not select or swallow keys while the palette is empty', () => {
    const command = vi.fn();
    const ref = createRef<PromptCommandListHandle>();
    render(<PromptCommandList command={command} items={[]} ref={ref} />);

    expect(pressKey(ref, 'Enter')).toBe(false);
    expect(command).not.toHaveBeenCalled();
  });

  it('keeps Enter on a real row after the list narrows under the highlight', () => {
    const command = vi.fn();
    const ref = createRef<PromptCommandListHandle>();
    const { rerender } = render(
      <PromptCommandList command={command} items={ITEMS} ref={ref} />,
    );

    pressKey(ref, 'ArrowUp');
    rerender(
      <PromptCommandList command={command} items={[ITEMS[0]]} ref={ref} />,
    );
    pressKey(ref, 'Enter');

    expect(command).toHaveBeenCalledWith(ITEMS[0]);
  });
});

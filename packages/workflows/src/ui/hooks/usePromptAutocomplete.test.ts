import type { AvailableVariable } from '@genfeedai/contracts/types';
import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePromptAutocomplete } from './usePromptAutocomplete';

const variables: AvailableVariable[] = [
  { name: 'subject', nodeId: 'n1', value: 'a cat' },
  { name: 'style', nodeId: 'n2', value: 'noir' },
  { name: 'setting', nodeId: 'n3', value: 'rooftop' },
];

function makeTextarea(selectionStart: number): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.focus = vi.fn();
  textarea.setSelectionRange = vi.fn();
  Object.defineProperty(textarea, 'selectionStart', {
    configurable: true,
    value: selectionStart,
  });
  return textarea;
}

function changeEvent(
  value: string,
  selectionStart = value.length,
): ChangeEvent<HTMLTextAreaElement> {
  return {
    target: { selectionStart, value },
  } as ChangeEvent<HTMLTextAreaElement>;
}

function keyEvent(key: string) {
  const event = {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  return event as typeof event & KeyboardEvent<HTMLTextAreaElement>;
}

function setup(template = '', cursor = template.length) {
  const textarea = makeTextarea(cursor);
  const textareaRef: RefObject<HTMLTextAreaElement | null> = {
    current: textarea,
  };
  const setLocalTemplate = vi.fn();
  const onTemplateCommit = vi.fn();
  const hook = renderHook(() =>
    usePromptAutocomplete({
      availableVariables: variables,
      localTemplate: template,
      onTemplateCommit,
      setLocalTemplate,
      textareaRef,
    }),
  );
  return { hook, onTemplateCommit, setLocalTemplate, textarea, textareaRef };
}

describe('usePromptAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the menu at the caret line when the user types @', () => {
    const { hook, setLocalTemplate } = setup();

    act(() => hook.result.current.handleChange(changeEvent('line one\n@')));

    expect(setLocalTemplate).toHaveBeenCalledWith('line one\n@');
    expect(hook.result.current.showAutocomplete).toBe(true);
    expect(hook.result.current.autocompletePosition).toEqual({
      left: 10,
      top: 50,
    });
    expect(hook.result.current.filteredAutocompleteVars).toHaveLength(3);
  });

  it('filters the variables by the text typed after @', () => {
    const { hook } = setup();

    act(() => hook.result.current.handleChange(changeEvent('hello @SU')));

    expect(
      hook.result.current.filteredAutocompleteVars.map((v) => v.name),
    ).toEqual(['subject']);
  });

  it('keeps the menu closed when there is no @ token before the caret', () => {
    const { hook } = setup();

    act(() => hook.result.current.handleChange(changeEvent('plain text')));

    expect(hook.result.current.showAutocomplete).toBe(false);
  });

  it('closes an open menu when the token is deleted', () => {
    const { hook } = setup();

    act(() => hook.result.current.handleChange(changeEvent('@s')));
    expect(hook.result.current.showAutocomplete).toBe(true);

    act(() => hook.result.current.handleChange(changeEvent('')));
    expect(hook.result.current.showAutocomplete).toBe(false);
  });

  it('ignores keys while the menu is closed', () => {
    const { hook } = setup();
    const event = keyEvent('ArrowDown');

    act(() => hook.result.current.handleKeyDown(event));

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(hook.result.current.selectedAutocompleteIndex).toBe(0);
  });

  it('cycles the selection with the arrow keys and wraps at both ends', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleChange(changeEvent('@s')));

    const up = keyEvent('ArrowUp');
    act(() => hook.result.current.handleKeyDown(up));
    expect(up.preventDefault).toHaveBeenCalled();
    expect(hook.result.current.selectedAutocompleteIndex).toBe(2);

    act(() => hook.result.current.handleKeyDown(keyEvent('ArrowDown')));
    expect(hook.result.current.selectedAutocompleteIndex).toBe(0);

    act(() => hook.result.current.handleKeyDown(keyEvent('ArrowDown')));
    expect(hook.result.current.selectedAutocompleteIndex).toBe(1);
  });

  it('closes on Escape without letting the event bubble', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleChange(changeEvent('@')));
    const event = keyEvent('Escape');

    act(() => hook.result.current.handleKeyDown(event));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(hook.result.current.showAutocomplete).toBe(false);
  });

  it('completes the highlighted variable on Enter and restores the caret', () => {
    const { hook, onTemplateCommit, setLocalTemplate, textarea } =
      setup('draw @su');
    act(() => hook.result.current.handleChange(changeEvent('draw @su')));
    const event = keyEvent('Enter');

    act(() => hook.result.current.handleKeyDown(event));

    expect(event.preventDefault).toHaveBeenCalled();
    expect(setLocalTemplate).toHaveBeenLastCalledWith('draw @subject');
    expect(onTemplateCommit).toHaveBeenCalledWith('draw @subject');
    expect(hook.result.current.showAutocomplete).toBe(false);

    act(() => {
      vi.runAllTimers();
    });
    expect(textarea.focus).toHaveBeenCalled();
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(13, 13);
  });

  it('completes on Tab and keeps the text after the caret', () => {
    const { hook, setLocalTemplate } = setup('a @st tail', 5);
    act(() => hook.result.current.handleChange(changeEvent('a @st tail', 5)));

    act(() => hook.result.current.handleKeyDown(keyEvent('Tab')));

    expect(setLocalTemplate).toHaveBeenLastCalledWith('a @style tail');
  });

  it('does not swallow Enter when nothing matches the filter', () => {
    const { hook, setLocalTemplate } = setup('@zzz');
    act(() => hook.result.current.handleChange(changeEvent('@zzz')));
    const event = keyEvent('Enter');

    act(() => hook.result.current.handleKeyDown(event));

    expect(hook.result.current.filteredAutocompleteVars).toEqual([]);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(setLocalTemplate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when selecting without a textarea or an @ token', () => {
    const noToken = setup('no token here');
    act(() => noToken.hook.result.current.handleAutocompleteSelect('subject'));
    expect(noToken.setLocalTemplate).not.toHaveBeenCalled();

    const detached = setup('@su');
    detached.textareaRef.current = null;
    act(() => detached.hook.result.current.handleAutocompleteSelect('subject'));
    expect(detached.setLocalTemplate).not.toHaveBeenCalled();
  });

  it('closeAutocomplete hides the menu', () => {
    const { hook } = setup();
    act(() => hook.result.current.handleChange(changeEvent('@')));

    act(() => hook.result.current.closeAutocomplete());

    expect(hook.result.current.showAutocomplete).toBe(false);
  });
});

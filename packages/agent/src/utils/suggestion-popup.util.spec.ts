import { describe, expect, it } from 'vitest';
import { getSuggestionClientRect } from './suggestion-popup.util';

describe('getSuggestionClientRect', () => {
  it('returns the live client rect when the editor provides one', () => {
    const rect = new DOMRect(10, 20, 30, 40);
    const getter = getSuggestionClientRect({
      clientRect: () => rect,
      editor: {} as never,
    });

    expect(getter()).toBe(rect);
  });

  it('falls back to an empty DOMRect when the caret is unavailable', () => {
    expect(getSuggestionClientRect(null)()).toEqual(new DOMRect());
    expect(
      getSuggestionClientRect({
        clientRect: () => null,
        editor: {} as never,
      })(),
    ).toEqual(new DOMRect());
    expect(
      getSuggestionClientRect({
        clientRect: null,
        editor: {} as never,
      })(),
    ).toEqual(new DOMRect());
  });
});

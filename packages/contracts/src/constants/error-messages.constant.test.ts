import { describe, expect, it } from 'vitest';
import { EMPTY_STATES } from './empty-states.constant';
import { ERROR_MESSAGES } from './error-messages.constant';

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.values(value).flatMap((entry) => collectStrings(entry));
}

describe('error and empty-state copy', () => {
  it('keeps every error message unique and non-empty', () => {
    const messages = collectStrings(ERROR_MESSAGES);

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('keeps empty-state labels unique and distinct from error copy', () => {
    const emptyStates = Object.values(EMPTY_STATES);
    const errors = new Set(collectStrings(ERROR_MESSAGES));

    expect(new Set(emptyStates).size).toBe(emptyStates.length);
    expect(emptyStates.every((label) => !errors.has(label))).toBe(true);
  });
});

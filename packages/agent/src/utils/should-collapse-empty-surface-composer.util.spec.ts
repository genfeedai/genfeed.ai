import { describe, expect, it } from 'vitest';
import { shouldCollapseEmptySurfaceComposer } from './should-collapse-empty-surface-composer.util';

const idleOccupancy = { hasContent: false, isFocused: false } as const;

function collapse(
  overrides: Partial<
    Parameters<typeof shouldCollapseEmptySurfaceComposer>[0]
  > = {},
) {
  return shouldCollapseEmptySurfaceComposer({
    hasAttachments: false,
    hasError: false,
    hasFollowUps: false,
    hasPendingInput: false,
    isEmptyConversation: false,
    isForceExpanded: false,
    isRunActive: false,
    isScrolledToBottom: false,
    occupancy: idleOccupancy,
    placement: 'surface',
    ...overrides,
  });
}

describe('shouldCollapseEmptySurfaceComposer', () => {
  it('collapses the empty unfocused surface composer after scrolling up', () => {
    expect(collapse()).toBe(true);
  });

  it('keeps dock and overlay composers visible', () => {
    expect(collapse({ placement: 'dock' })).toBe(false);
    expect(collapse({ placement: 'overlay' })).toBe(false);
  });

  it('stays expanded on an empty conversation, at the latest message, or when forced', () => {
    expect(collapse({ isEmptyConversation: true })).toBe(false);
    expect(collapse({ isScrolledToBottom: true })).toBe(false);
    expect(collapse({ isForceExpanded: true })).toBe(false);
  });

  it('expands for occupancy, a run, follow-ups, errors, or pending input', () => {
    expect(
      collapse({ occupancy: { hasContent: true, isFocused: false } }),
    ).toBe(false);
    expect(
      collapse({ occupancy: { hasContent: false, isFocused: true } }),
    ).toBe(false);
    expect(collapse({ hasAttachments: true })).toBe(false);
    expect(collapse({ isRunActive: true })).toBe(false);
    expect(collapse({ hasFollowUps: true })).toBe(false);
    expect(collapse({ hasError: true })).toBe(false);
    expect(collapse({ hasPendingInput: true })).toBe(false);
  });
});

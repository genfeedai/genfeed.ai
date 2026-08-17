import { describe, expect, it } from 'vitest';

import {
  hasRenderableThreadState,
  type RenderableThreadStateInput,
} from './has-renderable-thread-state';

const EMPTY: RenderableThreadStateInput = {
  hasLatestProposedPlan: false,
  hasPendingInputRequest: false,
  isStreaming: false,
  messageCount: 0,
  pendingUiActionCount: 0,
  streamingContentLength: 0,
  streamingReasoningLength: 0,
  workEventCount: 0,
};

describe('hasRenderableThreadState', () => {
  it('is empty when every source is empty', () => {
    expect(hasRenderableThreadState(EMPTY)).toBe(false);
  });

  it.each<[keyof RenderableThreadStateInput, number | boolean]>([
    ['messageCount', 1],
    ['hasLatestProposedPlan', true],
    ['hasPendingInputRequest', true],
    ['workEventCount', 1],
    ['pendingUiActionCount', 1],
    ['isStreaming', true],
    ['streamingContentLength', 1],
    ['streamingReasoningLength', 1],
  ])('renders when %s is set', (key, value) => {
    expect(hasRenderableThreadState({ ...EMPTY, [key]: value })).toBe(true);
  });

  it('keeps a pending generation card on screen before it is folded into a message', () => {
    // First prompt: the stream ended, the card arrived via tool_complete, and
    // the assistant message has not been appended yet — never show empty state.
    expect(
      hasRenderableThreadState({
        ...EMPTY,
        isStreaming: false,
        pendingUiActionCount: 1,
      }),
    ).toBe(true);
  });
});

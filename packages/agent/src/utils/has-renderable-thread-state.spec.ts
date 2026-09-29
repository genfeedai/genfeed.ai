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
});

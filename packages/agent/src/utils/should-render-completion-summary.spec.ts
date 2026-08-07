import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it } from 'vitest';

import { shouldRenderCompletionSummary } from './should-render-completion-summary';

function completion(partial: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    id: 'done-1',
    type: 'completion_summary_card',
    title: 'Done',
    summaryText: 'Generated content for this request.',
    ...partial,
  };
}

function batchResult(partial: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    id: 'batch-1',
    type: 'batch_generation_result_card',
    title: 'Batch generation complete',
    description: 'Generated 20 X drafts.',
    batchCount: 20,
    completedCount: 0,
    failedCount: 20,
    ...partial,
  };
}

describe('shouldRenderCompletionSummary', () => {
  it('hides generic Done when sibling batch fully failed', () => {
    expect(shouldRenderCompletionSummary(completion(), [batchResult()])).toBe(
      false,
    );
  });

  it('keeps Done when it has media previews', () => {
    expect(
      shouldRenderCompletionSummary(
        completion({
          outputVariants: [
            { id: 'v1', kind: 'image', url: 'https://cdn.example/a.png' },
          ],
        }),
        [batchResult()],
      ),
    ).toBe(true);
  });

  it('keeps Done without a sibling product card', () => {
    expect(shouldRenderCompletionSummary(completion(), [])).toBe(true);
  });

  it('keeps Done with real outcome bullets even with batch sibling', () => {
    expect(
      shouldRenderCompletionSummary(
        completion({
          outcomeBullets: ['3 drafts ready in review'],
          summaryText: 'Batch finished with partial success',
        }),
        [batchResult({ completedCount: 3, failedCount: 17 })],
      ),
    ).toBe(true);
  });
});

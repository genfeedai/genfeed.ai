import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it } from 'vitest';

import {
  completionSummaryHasOutcomeSignal,
  hasProductResultCard,
  shouldRenderCompletionSummary,
} from './should-render-completion-summary';

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

function contentPreview(partial: Partial<AgentUiAction> = {}): AgentUiAction {
  return {
    id: 'preview-1',
    type: 'content_preview_card',
    title: 'Draft ready',
    ...partial,
  };
}

describe('shouldRenderCompletionSummary', () => {
  it('hides generic Done when any product result card is present', () => {
    expect(
      shouldRenderCompletionSummary(completion(), [contentPreview()]),
    ).toBe(false);
    expect(
      shouldRenderCompletionSummary(completion(), [
        {
          id: 'clip-1',
          type: 'clip_run_card',
          title: 'Clip ready',
        },
      ]),
    ).toBe(false);
    expect(
      shouldRenderCompletionSummary(completion(), [
        {
          id: 'publish-1',
          type: 'publish_post_card',
          title: 'Ready to publish',
        },
      ]),
    ).toBe(false);
  });
});

describe('completionSummaryHasOutcomeSignal', () => {
  it('is false for generic copy-only Done', () => {
    expect(completionSummaryHasOutcomeSignal(completion())).toBe(false);
  });

  it('is false for tool-inventory bullets alone', () => {
    expect(
      completionSummaryHasOutcomeSignal(
        completion({
          summaryText: 'Completed this request successfully.',
          outcomeBullets: [
            '1 tool action completed',
            'Tool: Get Current Brand',
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('hasProductResultCard', () => {
  it('detects product result types', () => {
    expect(hasProductResultCard([batchResult()])).toBe(true);
    expect(hasProductResultCard([completion()])).toBe(false);
  });
});

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
  it('hides generic Done when sibling batch fully failed', () => {
    expect(shouldRenderCompletionSummary(completion(), [batchResult()])).toBe(
      false,
    );
  });

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

  it('hides generic Done on successful batch when Done has no extra signal', () => {
    expect(
      shouldRenderCompletionSummary(completion(), [
        batchResult({ completedCount: 18, failedCount: 2 }),
      ]),
    ).toBe(false);
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

  it('keeps Done with non-generic summary alongside a product card', () => {
    expect(
      shouldRenderCompletionSummary(
        completion({
          summaryText: 'Posted 4 assets and queued review.',
        }),
        [contentPreview()],
      ),
    ).toBe(true);
  });
});

describe('completionSummaryHasOutcomeSignal', () => {
  it('is false for generic copy-only Done', () => {
    expect(completionSummaryHasOutcomeSignal(completion())).toBe(false);
  });

  it('is true when bullets exist', () => {
    expect(
      completionSummaryHasOutcomeSignal(
        completion({ outcomeBullets: ['Ready in review'] }),
      ),
    ).toBe(true);
  });
});

describe('hasProductResultCard', () => {
  it('detects product result types', () => {
    expect(hasProductResultCard([batchResult()])).toBe(true);
    expect(hasProductResultCard([completion()])).toBe(false);
  });
});

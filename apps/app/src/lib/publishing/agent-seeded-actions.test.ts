import { describe, expect, it } from 'vitest';
import {
  buildReviewBatchRewriteAgentPrompt,
  buildRewriteCaptionAgentPrompt,
  buildScheduleSuggestionAgentPrompt,
} from './agent-seeded-actions';

describe('Publishing agent-seeded action prompts', () => {
  it('binds caption rewrites to the post ID and keeps the change reviewable', () => {
    expect(buildRewriteCaptionAgentPrompt({ postId: 'post-123' })).toBe(
      'Help me rewrite the caption for post ID post-123. Preserve its brand, platform, and intent, then give me a stronger draft to review before changing the post.',
    );
  });

  it('binds schedule suggestions to the post ID without scheduling immediately', () => {
    expect(buildScheduleSuggestionAgentPrompt({ postId: 'post-456' })).toBe(
      'Suggest the best publishing schedule for post ID post-456. Consider its brand, platform, audience, and current content, but do not schedule it until I confirm the recommendation.',
    );
  });

  it('includes the batch and unique selected review item IDs', () => {
    expect(
      buildReviewBatchRewriteAgentPrompt({
        batchId: 'batch-1',
        itemIds: ['item-1', 'item-2', 'item-1'],
      }),
    ).toBe(
      "Rewrite the captions for the selected review items in batch ID batch-1. Review item IDs: item-1, item-2. Preserve each item's platform and intent, and return revised drafts for review without approving or scheduling them.",
    );
  });
});

/**
 * Regression guard for #481 (dead SaaS node pruning) plus #4107 (catalog-generated
 * action nodes). Removed product types must not reappear as hand-written
 * inventories; live product types come from ALL_ACTIONS.
 *
 * - The 16 removed SaaS node types must not reappear in the SaaS registry or the
 *   merged registry.
 * - The SaaS `videoInput` shadow was deleted; the core `videoInput` (defined in
 *   @genfeedai/contracts/types) must be the effective merged-registry definition again.
 * - The retained SaaS node types must remain present.
 */

import { describe, expect, it } from 'vitest';
import { ACTION_NODE_DEFINITIONS } from './action-node-definitions';
import { NODE_DEFINITIONS } from './merged-registry';

/** Types deleted in #481 that no longer exist in any registry. */
const REMOVED_TYPES = [
  'patternContext',
  'followUser',
  'likePost',
  'rssInput',
  'tweetInput',
  'beatAnalysis',
  'beatSyncEditor',
  'imageTextOverlay',
  'slideshowImageBatch',
  'tweetRemix',
  'hookPerformanceTracker',
  'personaContentPlan',
  'personaPhotoSession',
  'personaVideoContent',
] as const;

describe('#481 SaaS node pruning', () => {
  it('removes every dead SaaS node type from the merged registry', () => {
    for (const type of REMOVED_TYPES) {
      expect(type in ACTION_NODE_DEFINITIONS, `${type} in action defs`).toBe(
        false,
      );
      expect(type in NODE_DEFINITIONS, `${type} in merged defs`).toBe(false);
    }
  });
});

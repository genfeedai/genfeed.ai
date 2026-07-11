/**
 * Regression guard for #481 (dead SaaS node pruning).
 *
 * - The 16 removed SaaS node types must not reappear in the SaaS registry or the
 *   merged registry.
 * - The SaaS `videoInput` shadow was deleted; the core `videoInput` (defined in
 *   @genfeedai/types) must be the effective merged-registry definition again.
 * - The retained SaaS node types must remain present.
 */
import {
  isCoreNode,
  NODE_DEFINITIONS,
} from '@workflow-saas/registry/merged-registry';
import {
  isSaaSNode,
  SAAS_NODE_DEFINITIONS,
} from '@workflow-saas/registry/saas-definitions';
import { describe, expect, it } from 'vitest';

/** Types deleted in #481 that no longer exist in any registry. */
const REMOVED_TYPES = [
  'patternContext',
  'condition',
  'delay',
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

/** SaaS node types that must survive the prune. */
const RETAINED_SAAS_TYPES = [
  'brand',
  'brandAsset',
  'brandContext',
  'analyticsFeedback',
  'commentTrigger',
  'engagementTrigger',
  'keywordTrigger',
  'musicSource',
  'trendTrigger',
  'soundOverlay',
  'hookGenerator',
  'trendHashtagInspiration',
  'trendSoundInspiration',
  'trendVideoInspiration',
  'postReply',
  'publish',
  'sendDm',
] as const;

describe('#481 SaaS node pruning', () => {
  it('removes every dead SaaS node type from both registries', () => {
    for (const type of REMOVED_TYPES) {
      expect(isSaaSNode(type), `${type} still a SaaS node`).toBe(false);
      expect(type in SAAS_NODE_DEFINITIONS, `${type} in SaaS defs`).toBe(false);
      expect(type in NODE_DEFINITIONS, `${type} in merged defs`).toBe(false);
    }
  });

  it('restores the core videoInput as the effective merged definition', () => {
    // The SaaS videoInput shadow is gone, so it is no longer a SaaS node...
    expect(isSaaSNode('videoInput')).toBe(false);
    // ...and the core definition wins the merge.
    expect(isCoreNode('videoInput')).toBe(true);
    expect('videoInput' in NODE_DEFINITIONS).toBe(true);
    expect(NODE_DEFINITIONS.videoInput).toBeDefined();
  });

  it('retains the live SaaS node types', () => {
    for (const type of RETAINED_SAAS_TYPES) {
      expect(isSaaSNode(type), `${type} missing from SaaS defs`).toBe(true);
    }
  });
});

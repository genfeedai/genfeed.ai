import { describe, expect, it } from 'vitest';

import { cloudNodeTypes } from './merged-node-types';

const TEMPLATE_NODE_TYPES = [
  'ai-avatar-video',
  'effect-captions',
  'hookGenerator',
  'imageGen',
  'musicSource',
  'promptConstructor',
  'castPrompt',
  'cast-prompt-generator',
  'soundOverlay',
  'talkingHeadScript',
  'workflowInput',
  'workflowOutput',
] as const;

const SOCIAL_REPORT_NODE_TYPES = ['socialRead', 'reportDelivery'] as const;
const CONTENT_LOOP_NODE_TYPES = [
  'analyticsGenericSync',
  'harnessWinnerPromotionSweep',
] as const;

describe('cloudNodeTypes', () => {
  it('registers all node types used by workflow templates', () => {
    for (const nodeType of TEMPLATE_NODE_TYPES) {
      expect(cloudNodeTypes[nodeType]).toBeDefined();
    }
  });

  it('registers analyticsGenericSync and harnessWinnerPromotionSweep as supported types', () => {
    for (const nodeType of CONTENT_LOOP_NODE_TYPES) {
      expect(cloudNodeTypes[nodeType]).toBeDefined();
    }
  });

  it('registers socialRead and reportDelivery for the cloud canvas (#2664)', () => {
    for (const nodeType of SOCIAL_REPORT_NODE_TYPES) {
      expect(cloudNodeTypes[nodeType]).toBeDefined();
    }
  });
});

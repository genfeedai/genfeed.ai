import { describe, expect, it } from 'vitest';

import { cloudNodeTypes } from './merged-node-types';

const TEMPLATE_NODE_TYPES = [
  'ai-avatar-video',
  'effect-captions',
  'imageGen',
  'musicSource',
  'promptConstructor',
  'soundOverlay',
  'workflowInput',
  'workflowOutput',
] as const;

describe('cloudNodeTypes', () => {
  it('registers all node types used by workflow templates', () => {
    for (const nodeType of TEMPLATE_NODE_TYPES) {
      expect(cloudNodeTypes[nodeType]).toBeDefined();
    }
  });
});

import { describe, expect, it } from 'vitest';

import { cloudNodeTypes } from './merged-node-types';

const ENGINE_NATIVE_NODE_TYPES = [
  'commentTrigger',
  'engagementTrigger',
  'input-image',
  'input-video',
  'keywordTrigger',
  'reviewGate',
  'workflowInput',
] as const;

describe('cloudNodeTypes', () => {
  it('renders engine-native workflow primitives without product aliases', () => {
    for (const nodeType of ENGINE_NATIVE_NODE_TYPES) {
      expect(cloudNodeTypes[nodeType]).toBeDefined();
    }
    expect(cloudNodeTypes.analyticsGenericSync).toBeUndefined();
    expect(cloudNodeTypes.socialRead).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import { cloudNodeTypes } from './merged-node-types';

const ACTION_NODE_TYPES = ['genfeedAction'] as const;
const ENGINE_NATIVE_NODE_TYPES = [
  'commentTrigger',
  'engagementTrigger',
  'keywordTrigger',
  'reviewGate',
  'workflowInput',
] as const;

describe('cloudNodeTypes', () => {
  it('renders product operations through the Genfeed action envelope', () => {
    for (const nodeType of ACTION_NODE_TYPES) {
      expect(cloudNodeTypes[nodeType]).toBeDefined();
    }
  });

  it('renders engine-native workflow primitives without product aliases', () => {
    for (const nodeType of ENGINE_NATIVE_NODE_TYPES) {
      expect(cloudNodeTypes[nodeType]).toBeDefined();
    }
    expect(cloudNodeTypes.analyticsGenericSync).toBeUndefined();
    expect(cloudNodeTypes.socialRead).toBeUndefined();
  });
});

import {
  isSaaSNode,
  SAAS_NODE_DEFINITIONS,
} from '@workflow-saas/registry/saas-definitions';
import { describe, expect, it } from 'vitest';

describe('SAAS_NODE_DEFINITIONS', () => {
  it('has expected types', () => {
    expect(Object.keys(SAAS_NODE_DEFINITIONS)).toContain('brand');
    expect(Object.keys(SAAS_NODE_DEFINITIONS)).toContain('publish');
  });

  it('each has required fields', () => {
    for (const [type, def] of Object.entries(SAAS_NODE_DEFINITIONS)) {
      expect(def.type).toBe(type);
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(Array.isArray(def.inputs)).toBe(true);
      expect(Array.isArray(def.outputs)).toBe(true);
    }
  });
});

describe('isSaaSNode', () => {
  it('true for saas', () => expect(isSaaSNode('brand')).toBe(true));
  it('false for non-saas', () => expect(isSaaSNode('textInput')).toBe(false));
});

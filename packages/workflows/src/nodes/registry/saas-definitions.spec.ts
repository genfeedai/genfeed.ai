import { describe, expect, it } from 'vitest';
import {
  getSaaSNodeTypes,
  isSaaSNode,
  SAAS_NODE_DEFINITIONS,
} from './saas-definitions';

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

  it('exposes analytics posting-time and publish schedule handles', () => {
    expect(SAAS_NODE_DEFINITIONS.analyticsFeedback.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'topHooks', type: 'text' }),
        expect.objectContaining({ id: 'worstTopics', type: 'text' }),
        expect.objectContaining({ id: 'bestPostingTimes', type: 'object' }),
      ]),
    );
    expect(SAAS_NODE_DEFINITIONS.publish.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'schedule', type: 'any' }),
      ]),
    );
  });

  it('exposes the full voice config without removing the legacy voice output', () => {
    expect(SAAS_NODE_DEFINITIONS.brandContext.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'voice', type: 'text' }),
        expect.objectContaining({ id: 'voiceConfig', type: 'object' }),
      ]),
    );
  });
});

describe('isSaaSNode', () => {
  it('true for saas', () => expect(isSaaSNode('brand')).toBe(true));
  it('false for non-saas', () => expect(isSaaSNode('textInput')).toBe(false));
});

describe('getSaaSNodeTypes', () => {
  it('lists exactly the keys of the definition map', () => {
    expect(getSaaSNodeTypes()).toEqual(Object.keys(SAAS_NODE_DEFINITIONS));
  });

  it('returns only types isSaaSNode agrees with', () => {
    for (const type of getSaaSNodeTypes()) {
      expect(isSaaSNode(type)).toBe(true);
    }
  });
});

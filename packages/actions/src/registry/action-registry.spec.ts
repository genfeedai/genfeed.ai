import { describe, expect, it } from 'vitest';
import {
  ALL_ACTIONS,
  createGenfeedActionNode,
  getActionDefinition,
} from './action-registry.js';

describe('Genfeed action registry', () => {
  it('contains exactly one definition for every action ID', () => {
    const ids = ALL_ACTIONS.map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generates action nodes from registered definitions', () => {
    expect(
      createGenfeedActionNode({
        actionId: 'youtube.resolve-source',
        id: 'resolve-source',
        inputVariableKeys: ['youtubeUrl'],
      }),
    ).toEqual({
      data: {
        config: {
          actionId: 'youtube.resolve-source',
          parameters: {},
        },
        inputVariableKeys: ['youtubeUrl'],
        label: 'Resolve YouTube Source',
      },
      id: 'resolve-source',
      position: { x: 0, y: 120 },
      type: 'genfeedAction',
    });
  });

  it('fails closed for an unknown action ID', () => {
    expect(getActionDefinition('not-an-action')).toBeUndefined();
    expect(() =>
      createGenfeedActionNode({
        actionId: 'not-an-action',
        id: 'unknown',
      }),
    ).toThrow('Unknown Genfeed action: not-an-action');
  });
});

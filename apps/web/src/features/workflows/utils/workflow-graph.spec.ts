import { describe, expect, it } from 'vitest';

import {
  coerceWorkflowItems,
  getWorkflowNodeConfig,
  getWorkflowNodeLabel,
} from './workflow-graph';

describe('workflow-graph helpers', () => {
  it('coerces invalid workflow collections to empty arrays', () => {
    expect(coerceWorkflowItems(null)).toEqual([]);
    expect(coerceWorkflowItems(undefined)).toEqual([]);
  });

  it('returns node config when node data is an object', () => {
    expect(
      getWorkflowNodeConfig({
        data: { label: 'Brand', status: 'idle' },
        id: 'node-1',
        type: 'brand',
      }),
    ).toEqual({
      label: 'Brand',
      status: 'idle',
    });
  });

  it('prefers the node label and falls back to type then id', () => {
    expect(
      getWorkflowNodeLabel({
        data: { label: 'Caption Generator' },
        id: 'node-1',
        type: 'captionGen',
      }),
    ).toBe('Caption Generator');

    expect(
      getWorkflowNodeLabel({
        data: {},
        id: 'node-2',
        type: 'captionGen',
      }),
    ).toBe('captionGen');

    expect(
      getWorkflowNodeLabel({
        data: undefined,
        id: 'node-3',
      }),
    ).toBe('node-3');
  });
});

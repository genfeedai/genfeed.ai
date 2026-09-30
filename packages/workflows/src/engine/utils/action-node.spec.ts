import { describe, expect, it } from 'vitest';
import {
  createExecutableActionNode,
  getExecutableNodeOperationId,
} from './action-node';

describe('createExecutableActionNode', () => {
  it('builds the one action-backed executable node envelope', () => {
    expect(
      createExecutableActionNode({
        actionId: 'videoGen',
        id: 'video',
        inputs: ['prompt'],
        isLocked: false,
        parameters: { duration: 8 },
      }),
    ).toEqual({
      config: {
        actionId: 'videoGen',
        parameters: { duration: 8 },
      },
      id: 'video',
      inputs: ['prompt'],
      isLocked: false,
      label: 'Generate Video',
      type: 'genfeedAction',
    });
  });

  it('fails closed for an action absent from the shared catalog', () => {
    expect(() =>
      createExecutableActionNode({
        actionId: 'removed-action',
        id: 'removed',
      }),
    ).toThrow('Unknown Genfeed action: removed-action');
  });

  it('resolves billing and execution identity from the action envelope', () => {
    const node = createExecutableActionNode({
      actionId: 'videoGen',
      id: 'video',
    });

    expect(getExecutableNodeOperationId(node)).toBe('videoGen');
    expect(
      getExecutableNodeOperationId({
        config: {},
        id: 'delay',
        inputs: [],
        label: 'Delay',
        type: 'delay',
      }),
    ).toBe('delay');
  });

  it('rejects raw product nodes instead of treating their type as an action', () => {
    expect(() =>
      getExecutableNodeOperationId({
        config: {},
        id: 'legacy-video',
        inputs: [],
        label: 'Legacy video',
        type: 'generateVideo',
      }),
    ).toThrow('must use the Genfeed action envelope');
  });

  it('rejects action envelopes whose catalog identity is unknown', () => {
    expect(() =>
      getExecutableNodeOperationId({
        config: { actionId: 'removed-action' },
        id: 'removed',
        inputs: [],
        label: 'Removed action',
        type: 'genfeedAction',
      }),
    ).toThrow('references unknown Genfeed action removed-action');
  });
});

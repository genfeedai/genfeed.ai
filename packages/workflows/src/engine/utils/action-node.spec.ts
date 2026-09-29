import { describe, expect, it } from 'vitest';
import {
  createExecutableActionNode,
  getExecutableNodeOperationId,
} from './action-node';

describe('createExecutableActionNode', () => {
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

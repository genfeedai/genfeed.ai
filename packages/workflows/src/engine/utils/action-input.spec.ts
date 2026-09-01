import { describe, expect, it } from 'vitest';
import { buildActionExecutionInput } from './action-input';

describe('buildActionExecutionInput', () => {
  it('removes engine metadata and unwraps payload', () => {
    expect(
      buildActionExecutionInput(
        {
          actionId: 'content.transform',
          inputVariableKeys: ['source'],
          payload: { payloadOnly: true, source: 'payload' },
        },
        new Map(),
      ),
    ).toEqual({ payloadOnly: true, source: 'payload' });
  });

  it('merges parameters, payload, config, then edge inputs by precedence', () => {
    expect(
      buildActionExecutionInput(
        {
          configOnly: true,
          parameters: { parameterOnly: true, source: 'parameters' },
          payload: { payloadOnly: true, source: 'payload' },
          source: 'config',
        },
        new Map([
          ['edgeOnly', true],
          ['source', 'edge'],
        ]),
      ),
    ).toEqual({
      configOnly: true,
      edgeOnly: true,
      parameterOnly: true,
      payloadOnly: true,
      source: 'edge',
    });
  });

  it('accepts record inputs for server adapters', () => {
    expect(
      buildActionExecutionInput(
        { payload: { source: 'payload' } },
        { source: 'adapter' },
      ),
    ).toEqual({ source: 'adapter' });
  });

  it('omits undefined properties at the JSON action boundary', () => {
    expect(
      buildActionExecutionInput(
        {
          parameters: {
            aspectRatio: '1:1',
            duration: undefined,
            outputs: 1,
            resolution: undefined,
          },
        },
        new Map(),
      ),
    ).toStrictEqual({ aspectRatio: '1:1', outputs: 1 });
  });
});

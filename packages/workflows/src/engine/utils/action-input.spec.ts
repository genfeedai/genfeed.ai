import { describe, expect, it } from 'vitest';
import { buildActionExecutionInput } from './action-input';

describe('buildActionExecutionInput', () => {
  it('accepts record inputs for server adapters', () => {
    expect(
      buildActionExecutionInput(
        { payload: { source: 'payload' } },
        { source: 'adapter' },
      ),
    ).toEqual({ source: 'adapter' });
  });
});

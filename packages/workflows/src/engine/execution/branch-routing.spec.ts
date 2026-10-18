import { describe, expect, it } from 'vitest';
import { resolveConditionBranchOutput } from './branch-routing';

describe('resolveConditionBranchOutput', () => {
  const output = { data: { id: 'a' }, result: true, value: true };

  it('delivers the passthrough data on the taken branch', () => {
    expect(resolveConditionBranchOutput('true', output)).toEqual({
      isBranch: true,
      isTaken: true,
      value: { id: 'a' },
    });
  });

  it('marks the other branch as not taken', () => {
    expect(resolveConditionBranchOutput('false', output)).toMatchObject({
      isBranch: true,
      isTaken: false,
    });
    expect(
      resolveConditionBranchOutput('true', { ...output, result: false }),
    ).toMatchObject({ isBranch: true, isTaken: false });
  });

  it.each([
    ['no handle', undefined, output],
    ['a non-branch handle', 'items', output],
    ['a scalar output', 'true', true],
    ['an output without a boolean result', 'true', { data: 1, result: 'x' }],
    ['an output without data', 'true', { result: true }],
    [
      'an output that carries the handle itself',
      'true',
      { true: 1, data: 1, result: true },
    ],
  ])('ignores %s', (_label, handle, value) => {
    expect(resolveConditionBranchOutput(handle, value)).toEqual({
      isBranch: false,
    });
  });
});

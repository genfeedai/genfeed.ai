import {
  resolveImageDispatchExecutePath,
  shouldFailAdditionalActivity,
  shouldTrackSequentialOutputInResponse,
} from './image-generation-dispatch-path.util';

describe('resolveImageDispatchExecutePath', () => {
  it('uses a single path for one output even when a strategy is set', () => {
    expect(
      resolveImageDispatchExecutePath({
        outputStrategy: 'sequential',
        outputs: 1,
      }),
    ).toBe('single');
  });

  it('routes multi-output requests by strategy and defaults to single', () => {
    expect(
      resolveImageDispatchExecutePath({
        outputStrategy: 'batch',
        outputs: 3,
      }),
    ).toBe('batch');
    expect(
      resolveImageDispatchExecutePath({
        outputStrategy: 'sequential',
        outputs: 3,
      }),
    ).toBe('sequential');
    expect(
      resolveImageDispatchExecutePath({
        outputs: 3,
      }),
    ).toBe('single');
  });
});

describe('sequential output failure policy', () => {
  it('fails closed only when the adapter opts into activity failure', () => {
    expect(shouldFailAdditionalActivity('fail')).toBe(true);
    expect(shouldFailAdditionalActivity('log')).toBe(false);
    expect(shouldTrackSequentialOutputInResponse(true)).toBe(true);
    expect(shouldTrackSequentialOutputInResponse(undefined)).toBe(false);
  });
});

import {
  resolveImageDispatchExecutePath,
  shouldFailAdditionalActivity,
  shouldTrackSequentialOutputInResponse,
} from './image-generation-dispatch-path.util';

describe('resolveImageDispatchExecutePath', () => {
  it('prefers inline completion over output strategy', () => {
    expect(
      resolveImageDispatchExecutePath({
        completionKind: 'inline',
        outputStrategy: 'batch',
        outputs: 4,
      }),
    ).toBe('inline');
  });

  it('uses a single path for one output even when a strategy is set', () => {
    expect(
      resolveImageDispatchExecutePath({
        completionKind: 'poll-multiple',
        outputStrategy: 'sequential',
        outputs: 1,
      }),
    ).toBe('single');
  });

  it('routes multi-output requests by strategy and defaults to single', () => {
    expect(
      resolveImageDispatchExecutePath({
        completionKind: 'poll-multiple',
        outputStrategy: 'batch',
        outputs: 3,
      }),
    ).toBe('batch');
    expect(
      resolveImageDispatchExecutePath({
        completionKind: 'poll-multiple',
        outputStrategy: 'sequential',
        outputs: 3,
      }),
    ).toBe('sequential');
    expect(
      resolveImageDispatchExecutePath({
        completionKind: 'poll-multiple',
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

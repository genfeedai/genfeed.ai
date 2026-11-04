import { describe, expect, it } from 'vitest';
import { resolveAuthorizedSignalsSnapshotState } from './authorized-signals-state.util';

const platform = (key: string, status: string) => ({
  key,
  provenance: 'platform_verified',
  status,
});

describe('resolveAuthorizedSignalsSnapshotState', () => {
  it.each([
    [
      'all platform evidence stale',
      [platform('profile', 'stale'), platform('posts', 'stale')],
      'stale',
    ],
    [
      'primary snapshot empty and nothing failed',
      [platform('profile', 'available'), platform('posts', 'empty')],
      'empty',
    ],
    [
      'everything available',
      [platform('profile', 'available'), platform('posts', 'available')],
      'full',
    ],
    [
      'empty non-primary snapshot',
      [platform('profile', 'empty'), platform('posts', 'available')],
      'full',
    ],
    [
      'primary empty but another snapshot failed',
      [platform('profile', 'unavailable'), platform('posts', 'empty')],
      'partial',
    ],
    [
      'a mix of stale and available',
      [platform('profile', 'stale'), platform('posts', 'available')],
      'partial',
    ],
  ])('returns the expected state when %s', (_label, evidence, expected) => {
    expect(resolveAuthorizedSignalsSnapshotState(evidence, 'posts')).toBe(
      expected,
    );
  });

  it('ignores Genfeed-observed evidence', () => {
    expect(
      resolveAuthorizedSignalsSnapshotState(
        [
          platform('posts', 'available'),
          { key: 'genfeed', provenance: 'genfeed_observed', status: 'empty' },
        ],
        'posts',
      ),
    ).toBe('full');
  });
});

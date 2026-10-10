import { toClipSourceFailureMessage } from '@api/collections/clip-projects/services/clip-source-contract.util';
import { describe, expect, it } from 'vitest';

describe('toClipSourceFailureMessage', () => {
  it('drops the failed graph step name', () => {
    expect(
      toClipSourceFailureMessage(
        'Nodes failed: prepare-source: Audio extraction job 7 failed: Source video is unreadable',
      ),
    ).toBe('Audio extraction job 7 failed: Source video is unreadable');
  });

  it('keeps a message that is not a graph failure', () => {
    expect(toClipSourceFailureMessage('Highlights unavailable')).toBe(
      'Highlights unavailable',
    );
  });
});

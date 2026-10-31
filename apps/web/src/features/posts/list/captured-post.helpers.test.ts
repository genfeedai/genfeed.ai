import { PostVisibility } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  capturedPostSummary,
  capturedPostTitle,
  resolveCapturedAudience,
} from './captured-post.helpers';

describe('resolveCapturedAudience', () => {
  it.each([
    PostVisibility.PUBLIC,
    PostVisibility.PRIVATE,
    PostVisibility.UNLISTED,
  ])('preserves the observed %s audience', (visibility) => {
    expect(resolveCapturedAudience(visibility)).toBe(visibility);
  });

  it.each([undefined, null, '', 'PUBLIC', 'published'])(
    'reports %s as unavailable rather than guessing',
    (visibility) => {
      expect(resolveCapturedAudience(visibility)).toBe('unavailable');
    },
  );
});

describe('captured post text', () => {
  it('prefers the label and falls back to the description, then the placeholder', () => {
    expect(
      capturedPostTitle({ description: 'Body', label: 'Title' }, 'x'),
    ).toBe('Title');
    expect(capturedPostTitle({ description: ' Body ', label: ' ' }, 'x')).toBe(
      'Body',
    );
    expect(capturedPostTitle({}, 'Captured publication')).toBe(
      'Captured publication',
    );
  });

  it('shows the full text only when the title is a shortened form of it', () => {
    expect(
      capturedPostSummary({ description: 'A long post body', label: 'A long' }),
    ).toBe('A long post body');
    expect(
      capturedPostSummary({ description: 'Same text', label: 'Same text' }),
    ).toBe('');
    expect(capturedPostSummary({ label: 'Only a label' })).toBe('');
  });
});

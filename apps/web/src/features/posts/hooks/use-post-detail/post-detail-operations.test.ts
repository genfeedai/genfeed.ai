import { describe, expect, it } from 'vitest';
import {
  isPostDetailPublishBlocked,
  type PostDetailOperation,
  setPostDetailOperation,
} from './post-detail-operations';

describe('isPostDetailPublishBlocked', () => {
  it.each<[PostDetailOperation, boolean]>([
    ['update', false],
    ['save-ingredients', false],
    ['save-description', false],
    ['save-schedule', true],
    ['toggle-grok', false],
    ['toggle-first-comment', false],
    ['expand-to-thread', false],
  ])('%s blocks Schedule and Publish: %s', (operation, expected) => {
    expect(isPostDetailPublishBlocked(new Set([operation]))).toBe(expected);
  });

  it('does not block with nothing in flight', () => {
    expect(isPostDetailPublishBlocked(new Set())).toBe(false);
  });
});

describe('setPostDetailOperation', () => {
  it('runs two saves at once and ends each on its own', () => {
    const both = setPostDetailOperation(
      setPostDetailOperation(new Set(), 'save-description', true),
      'save-ingredients',
      true,
    );
    const left = setPostDetailOperation(both, 'save-description', false);

    expect([...both]).toEqual(['save-description', 'save-ingredients']);
    expect([...left]).toEqual(['save-ingredients']);
  });

  it('keeps the same set when nothing changes', () => {
    const pending = new Set<PostDetailOperation>(['update']);

    expect(setPostDetailOperation(pending, 'update', true)).toBe(pending);
    expect(setPostDetailOperation(pending, 'toggle-grok', false)).toBe(pending);
  });

  it('is empty once every save ended', () => {
    const ended = setPostDetailOperation(
      new Set<PostDetailOperation>(['update']),
      'update',
      false,
    );

    expect(ended.size).toBe(0);
  });
});

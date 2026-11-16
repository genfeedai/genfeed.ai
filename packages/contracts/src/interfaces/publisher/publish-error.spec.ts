import { describe, expect, it } from 'vitest';
import { PublishErrorKind } from '../../enums/publish-error-kind.enum';
import {
  isPublishError,
  PublishError,
  readPublishErrorKind,
} from './publish-error';

describe('PublishError', () => {
  it('carries the kind and the provider detail it was given', () => {
    const resetAt = new Date('2026-11-16T08:00:00.000Z');
    const error = new PublishError(PublishErrorKind.RATE_LIMITED, 'Slow', {
      httpStatus: 429,
      providerCode: '88',
      resetAt,
    });

    expect(error).toMatchObject({
      httpStatus: 429,
      kind: PublishErrorKind.RATE_LIMITED,
      message: 'Slow',
      providerCode: '88',
      resetAt,
    });
  });

  it.each(Object.values(PublishErrorKind))('reads kind %s back', (kind) => {
    expect(readPublishErrorKind(new PublishError(kind, 'x'))).toBe(kind);
  });

  it.each([
    ['a plain error', new Error('429')],
    ['a string', 'rate limit'],
    ['null', null],
    ['an unknown kind', { kind: 'bogus', name: 'PublishError' }],
    ['a lookalike without the name', { kind: 'retry_later' }],
  ])('reads no kind from %s', (_label, value) => {
    expect(readPublishErrorKind(value)).toBeNull();
    expect(isPublishError(value)).toBe(false);
  });

  it('still reads the kind from a copy that is not an instance', () => {
    expect(
      readPublishErrorKind({ kind: 'content_rejected', name: 'PublishError' }),
    ).toBe(PublishErrorKind.CONTENT_REJECTED);
  });
});

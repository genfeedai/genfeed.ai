import { describe, expect, it } from 'vitest';
import { classifyGenerationFailure } from './generation-failure.util';

describe('classifyGenerationFailure', () => {
  it('names a provider copyright block', () => {
    expect(
      classifyGenerationFailure(
        'Async prediction failed: Exception: The request failed because the output video may be related to copyright restrictions. Request id: 0219 (request ID: cgt-20261025170538-1x71h)',
      ),
    ).toBe('copyright');
  });

  it.each([
    ['Blocked by the content policy', 'contentPolicy'],
    ['Insufficient credits on the provider account', 'credits'],
    ['429 Too Many Requests', 'rateLimit'],
    ['Prediction timed out after 600s', 'timeout'],
    ['Upstream returned 503', 'unavailable'],
  ])('classifies %s', (message, reason) => {
    expect(classifyGenerationFailure(message)).toBe(reason);
  });

  it('falls back to generic for unknown or empty text', () => {
    expect(classifyGenerationFailure('Exception: boom')).toBe('generic');
    expect(classifyGenerationFailure('  ')).toBe('generic');
    expect(classifyGenerationFailure(undefined)).toBe('generic');
  });
});

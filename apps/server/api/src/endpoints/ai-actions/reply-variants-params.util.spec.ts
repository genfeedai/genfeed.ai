import { parseReplyVariantsParams } from '@api/endpoints/ai-actions/reply-variants-params.util';
import { describe, expect, it } from 'vitest';

const valid = {
  brandId: 'brand-1',
  platform: 'reddit',
  postAuthor: 'u/ada',
  postContent: 'We just launched.',
  requestKey: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
  tone: 'challenge',
  variants: 4,
};

describe('parseReplyVariantsParams', () => {
  it('accepts a complete request', () => {
    expect(parseReplyVariantsParams(valid)).toEqual({ ok: true, value: valid });
  });

  it('defaults to three variants and needs neither brand nor author', () => {
    const { brandId: _b, postAuthor: _a, variants: _v, ...minimal } = valid;
    expect(parseReplyVariantsParams(minimal)).toEqual({
      ok: true,
      value: { ...minimal, variants: 3 },
    });
  });

  it.each([
    [{ tone: 'friendly' }, 'tone'],
    [{ variants: 0 }, 'variants'],
    [{ variants: 6 }, 'variants'],
    [{ variants: 2.5 }, 'variants'],
    [{ postContent: ' ' }, 'postContent'],
    [{ postContent: 'x'.repeat(5001) }, 'postContent'],
    [{ requestKey: 'nope' }, 'requestKey'],
    [{ platform: '' }, 'platform'],
    [{ postAuthor: 'x'.repeat(201) }, 'postAuthor'],
  ])('rejects %j naming %s', (patch, field) => {
    const result = parseReplyVariantsParams({ ...valid, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.startsWith(`${field}:`)).toBe(true);
  });
});

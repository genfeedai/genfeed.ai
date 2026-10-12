import { parseTextActionParams } from '@api/endpoints/ai-actions/text-action-params.util';
import { describe, expect, it } from 'vitest';

const valid = {
  brandId: 'brand-1',
  mode: 'proofread',
  platform: 'linkedin',
  requestKey: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
  text: 'Draft',
};

describe('parseTextActionParams', () => {
  it('accepts a complete request and drops unknown fields', () => {
    expect(parseTextActionParams({ ...valid, extra: 'ignored' })).toEqual({
      ok: true,
      value: valid,
    });
  });

  it('does not require a brand: the server resolves one', () => {
    const { brandId: _brandId, ...withoutBrand } = valid;
    expect(parseTextActionParams(withoutBrand)).toMatchObject({ ok: true });
  });

  it.each([
    [{ mode: 'summarize' }, 'mode'],
    [{ platform: ' ' }, 'platform'],
    [{ requestKey: 'not-a-uuid' }, 'requestKey'],
    [{ requestKey: undefined }, 'requestKey'],
    [{ text: '  \n ' }, 'text'],
    [{ text: 'x'.repeat(10_001) }, 'text'],
    [{ text: 42 }, 'text'],
  ])('rejects %j naming %s', (patch, field) => {
    const result = parseTextActionParams({ ...valid, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.startsWith(`${field}:`)).toBe(true);
  });
});

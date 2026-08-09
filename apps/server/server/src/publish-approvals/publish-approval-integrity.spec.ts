import { createHash } from 'node:crypto';
import { digestPublishApprovalValue } from './publish-approval-integrity';

describe('digestPublishApprovalValue', () => {
  it('prefixes the digest with the versioned algorithm marker', () => {
    expect(digestPublishApprovalValue({ a: 1 })).toMatch(
      /^sha256:v1:[0-9a-f]{64}$/,
    );
  });

  it('is stable across key ordering', () => {
    expect(digestPublishApprovalValue({ a: 1, b: 2 })).toBe(
      digestPublishApprovalValue({ b: 2, a: 1 }),
    );
  });

  it('is sensitive to array ordering', () => {
    expect(digestPublishApprovalValue([1, 2])).not.toBe(
      digestPublishApprovalValue([2, 1]),
    );
  });

  it('distinguishes nested structures from their flattened spelling', () => {
    expect(digestPublishApprovalValue({ a: { b: 1 } })).not.toBe(
      digestPublishApprovalValue({ 'a.b': 1 }),
    );
  });

  it('digests primitives and null', () => {
    const expected = `sha256:v1:${createHash('sha256')
      .update('"hello"')
      .digest('hex')}`;

    expect(digestPublishApprovalValue('hello')).toBe(expected);
    expect(digestPublishApprovalValue(null)).toMatch(
      /^sha256:v1:[0-9a-f]{64}$/,
    );
    expect(digestPublishApprovalValue(42)).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
    expect(digestPublishApprovalValue(true)).toMatch(
      /^sha256:v1:[0-9a-f]{64}$/,
    );
  });

  it('treats undefined as the literal null encoding', () => {
    expect(digestPublishApprovalValue(undefined)).toBe(
      digestPublishApprovalValue(null),
    );
  });

  it('digests nested arrays of objects deterministically', () => {
    const first = digestPublishApprovalValue({
      items: [{ id: 'b', qty: 2 }, { id: 'a' }],
    });
    const second = digestPublishApprovalValue({
      items: [{ qty: 2, id: 'b' }, { id: 'a' }],
    });

    expect(first).toBe(second);
  });
});

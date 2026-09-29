import { createHash } from 'node:crypto';
import { digestPublishApprovalValue } from './publish-approval-integrity';

describe('digestPublishApprovalValue', () => {
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

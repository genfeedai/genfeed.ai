import { createCardApprovalProofs } from '@mcp/services/mcp-card-approval-proof.util';

describe('createCardApprovalProofs', () => {
  const member = { userId: 'user-1' };

  it('accepts a proof for the approval it was minted for', () => {
    const proofs = createCardApprovalProofs('key', member);

    expect(proofs?.verify('apr-1', proofs.mint('apr-1'))).toBe(true);
  });

  it('refuses a proof for another approval', () => {
    const proofs = createCardApprovalProofs('key', member);

    expect(proofs?.verify('apr-2', proofs.mint('apr-1'))).toBe(false);
  });

  it('refuses a proof minted for another member', () => {
    const mine = createCardApprovalProofs('key', member);
    const theirs = createCardApprovalProofs('key', { userId: 'user-2' });

    expect(theirs?.verify('apr-1', mine?.mint('apr-1'))).toBe(false);
  });

  it('refuses a proof signed with another service key', () => {
    const other = createCardApprovalProofs('other-key', member);
    const proofs = createCardApprovalProofs('key', member);

    expect(proofs?.verify('apr-1', other?.mint('apr-1'))).toBe(false);
  });

  it('refuses a proof after ten minutes', () => {
    let now = 1_000_000;
    const proofs = createCardApprovalProofs('key', member, () => now);
    const proof = proofs?.mint('apr-1');

    now += 10 * 60 * 1000;
    expect(proofs?.verify('apr-1', proof)).toBe(true);
    now += 1;
    expect(proofs?.verify('apr-1', proof)).toBe(false);
  });

  it('refuses a proof whose expiry was pushed out', () => {
    let now = 1_000_000;
    const proofs = createCardApprovalProofs('key', member, () => now);
    const [, signature] = (proofs?.mint('apr-1') ?? '').split('.');

    now += 60 * 60 * 1000;
    expect(proofs?.verify('apr-1', `${now + 1000}.${signature}`)).toBe(false);
  });

  it.each([undefined, null, '', 'abc', '123.', '.abc', '1.2.3', 42, {}])(
    'refuses %j',
    (proof) => {
      const proofs = createCardApprovalProofs('key', member);

      expect(proofs?.verify('apr-1', proof)).toBe(false);
    },
  );

  it.each([
    ['no service key', undefined, member],
    ['an empty service key', '', member],
    ['no member', 'key', {}],
  ])('mints nothing with %s', (_label, key, who) => {
    expect(createCardApprovalProofs(key, who)).toBeNull();
  });
});

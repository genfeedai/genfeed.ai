import { withoutInternalLedgerMetadata } from '@api/collections/credits/utils/ledger-metadata.util';

describe('withoutInternalLedgerMetadata', () => {
  it('removes only the internal abuse keys', () => {
    const row = {
      id: 'tx-1',
      metadata: {
        campaign: 'x',
        emailKey: 'a',
        ipKey: 'b',
        kind: 'promotional',
      },
    };

    expect(withoutInternalLedgerMetadata(row)).toEqual({
      id: 'tx-1',
      metadata: { campaign: 'x', kind: 'promotional' },
    });
    expect(row.metadata.emailKey).toBe('a');
  });

  it('leaves rows without object metadata untouched', () => {
    const empty = { id: 'tx-2', metadata: null };
    const list = { id: 'tx-3', metadata: ['emailKey'] };

    expect(withoutInternalLedgerMetadata(empty)).toBe(empty);
    expect(withoutInternalLedgerMetadata(list)).toBe(list);
  });
});

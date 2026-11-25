import { walletMergeUpdate } from '@api/collections/billing-accounts/services/wallet-merge.util';

describe('walletMergeUpdate', () => {
  it.each([
    {
      expectedEarned: 150,
      into: { balance: 300, earnedBalance: 100, earnedSpent: 0, heldAmount: 0 },
      name: 'adds both earned totals and carries the earned spend across',
      wallet: { balance: 60, earnedBalance: 50, earnedSpent: 7, heldAmount: 0 },
    },
    {
      expectedEarned: 80,
      into: { balance: 100, earnedBalance: 100, earnedSpent: 0, heldAmount: 0 },
      name: 'pays a debt from earned credits first',
      wallet: { balance: -20, earnedBalance: 0, earnedSpent: 0, heldAmount: 0 },
    },
    {
      expectedEarned: 0,
      into: { balance: 10, earnedBalance: 10, earnedSpent: 0, heldAmount: 0 },
      name: 'never goes below zero',
      wallet: { balance: -30, earnedBalance: 0, earnedSpent: 0, heldAmount: 0 },
    },
  ])('$name', ({ expectedEarned, into, wallet }) => {
    expect(walletMergeUpdate(wallet, into)).toEqual({
      balance: { increment: wallet.balance },
      earnedBalance: expectedEarned,
      earnedSpent: { increment: wallet.earnedSpent },
      heldAmount: { increment: wallet.heldAmount },
      version: { increment: 1 },
    });
  });
});

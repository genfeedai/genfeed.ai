import { PAYG_CREDIT_PACKS } from '@genfeedai/pricing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreditTopUpPanel from './credit-top-up-panel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('CreditTopUpPanel', () => {
  it('names each credit pack with what it buys', () => {
    render(<CreditTopUpPanel isStartingCheckout={false} onSubmit={vi.fn()} />);

    for (const pack of PAYG_CREDIT_PACKS) {
      expect(
        screen.getByRole('radio', {
          name: `${pack.label}, ${pack.credits.toLocaleString('en-US')} credits`,
        }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole('radio', { name: 'Custom credit amount' }),
    ).toBeInTheDocument();
  });
});

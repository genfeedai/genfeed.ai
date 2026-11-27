import { PAYG_CREDIT_PACKS } from '@genfeedai/pricing';
import { fireEvent, render, screen } from '@testing-library/react';
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

  describe('custom amount', () => {
    const amountField = () =>
      screen.getByLabelText('Custom credit top-up amount in dollars');

    function renderCustom() {
      render(
        <CreditTopUpPanel isStartingCheckout={false} onSubmit={vi.fn()} />,
      );
      fireEvent.click(
        screen.getByRole('radio', { name: 'Custom credit amount' }),
      );
    }

    it('shows the allowed range on the Custom tile and no field until it is picked', () => {
      render(
        <CreditTopUpPanel isStartingCheckout={false} onSubmit={vi.fn()} />,
      );

      expect(screen.getByText('$10 to $10,000')).toBeInTheDocument();
      expect(screen.queryByLabelText('Custom amount')).not.toBeInTheDocument();
    });

    it('shows the credits for a valid amount inside the field and in the summary', () => {
      renderCustom();
      fireEvent.change(amountField(), { target: { value: '25' } });

      expect(screen.getAllByText('2,500 credits')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Add credit' })).toBeEnabled();
    });

    it('asks for an amount while the custom field is empty', () => {
      renderCustom();

      expect(screen.getByText('Enter an amount to continue.')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Add credit' })).toBeDisabled();
    });

    it('replaces the range hint with the error for an invalid amount', () => {
      renderCustom();
      fireEvent.change(amountField(), { target: { value: '12.5' } });

      expect(screen.getByText('Enter a whole-dollar amount.')).toBeVisible();
      expect(screen.queryByText(/Whole dollars from/)).not.toBeInTheDocument();
    });

    it('steps the amount by $10 and stays within the limits', () => {
      renderCustom();

      fireEvent.click(
        screen.getByRole('button', { name: 'Increase amount by $10' }),
      );
      expect(amountField()).toHaveValue('10');

      fireEvent.click(
        screen.getByRole('button', { name: 'Increase amount by $10' }),
      );
      expect(amountField()).toHaveValue('20');
      expect(
        screen.getByRole('button', { name: 'Decrease amount by $10' }),
      ).toBeEnabled();

      fireEvent.change(amountField(), { target: { value: '10' } });
      expect(
        screen.getByRole('button', { name: 'Decrease amount by $10' }),
      ).toBeDisabled();

      fireEvent.change(amountField(), { target: { value: '10000' } });
      expect(
        screen.getByRole('button', { name: 'Increase amount by $10' }),
      ).toBeDisabled();
    });

    it('accepts an amount typed with a thousands separator', () => {
      renderCustom();
      fireEvent.change(amountField(), { target: { value: '1,500' } });

      expect(screen.getAllByText('150,000 credits')).toHaveLength(2);
    });
  });
});

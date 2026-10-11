import { TurboRunCard } from '@genfeedai/agent/components/TurboRunCard';
import {
  estimateTurboRunCredits,
  resolveTurboRunPricingOptions,
} from '@genfeedai/contracts/constants';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('TurboRunCard', () => {
  it('estimates format-aware credits, not count × platforms × 10', () => {
    render(
      <TurboRunCard
        action={{
          turboRunCount: 20,
          id: 'run-form-1',
          platforms: ['twitter'],
          title: 'Turbo run',
          type: 'turbo_run_card',
        }}
      />,
    );

    // Priced through the shared resolver — the same flags the server charge
    // uses, so a drift between quote and bill fails here.
    const expected = estimateTurboRunCredits(
      { count: 20, platforms: ['twitter'] },
      resolveTurboRunPricingOptions({ hasMediaGeneration: false }),
    );

    expect(
      screen.getByText(new RegExp(`Estimated cost: ${expected} credits`, 'i')),
    ).toBeInTheDocument();
    expect(screen.queryByText(/200 credits/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/flat batch fee/i)).not.toBeInTheDocument();
  });

  it('honors an explicit creditEstimate only while inputs match the suggestion', async () => {
    const user = userEvent.setup();
    render(
      <TurboRunCard
        action={{
          turboRunCount: 20,
          creditEstimate: 12,
          id: 'run-form-2',
          platforms: ['twitter'],
          title: 'Turbo run',
          type: 'turbo_run_card',
        }}
      />,
    );

    expect(screen.getByText(/Estimated cost: 12 credits/i)).toBeInTheDocument();

    const countInput = screen.getByLabelText(/Number of items/i);
    await user.clear(countInput);
    await user.type(countInput, '5');

    const recomputed = estimateTurboRunCredits(
      { count: 5, platforms: ['twitter'] },
      resolveTurboRunPricingOptions({ hasMediaGeneration: false }),
    );
    expect(
      screen.getByText(
        new RegExp(`Estimated cost: ${recomputed} credits`, 'i'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Estimated cost: 12 credits/i),
    ).not.toBeInTheDocument();
  });

  it('submits the selected count and platforms', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(
      <TurboRunCard
        action={{
          turboRunCount: 5,
          id: 'run-form-3',
          platforms: ['twitter'],
          title: 'Turbo run',
          type: 'turbo_run_card',
        }}
        onGenerate={onGenerate}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Generate/i }));

    expect(onGenerate).toHaveBeenCalledWith({
      count: 5,
      platforms: ['twitter'],
    });
  });

  it('recomputes the estimate when the platform selection leaves the suggestion (#2696)', async () => {
    const user = userEvent.setup();
    render(
      <TurboRunCard
        action={{
          turboRunCount: 10,
          creditEstimate: 99,
          id: 'run-form-4',
          platforms: ['twitter'],
          title: 'Turbo run',
          type: 'turbo_run_card',
        }}
      />,
    );

    expect(screen.getByText(/Estimated cost: 99 credits/i)).toBeInTheDocument();

    // Adding Instagram makes the selection differ from the suggested set.
    await user.click(screen.getByText('Instagram'));

    const recomputed = estimateTurboRunCredits(
      { count: 10, platforms: ['twitter', 'instagram'] },
      resolveTurboRunPricingOptions({ hasMediaGeneration: false }),
    );
    expect(
      screen.getByText(
        new RegExp(`Estimated cost: ${recomputed} credits`, 'i'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Estimated cost: 99 credits/i),
    ).not.toBeInTheDocument();
  });
});

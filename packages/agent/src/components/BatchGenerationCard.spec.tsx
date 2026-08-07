import { BatchGenerationCard } from '@genfeedai/agent/components/BatchGenerationCard';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

describe('BatchGenerationCard', () => {
  it('estimates a flat batch tool fee of 5 credits, not count × platforms × 10', () => {
    render(
      <BatchGenerationCard
        action={{
          batchCount: 20,
          id: 'batch-form-1',
          platforms: ['twitter'],
          title: 'Batch generation',
          type: 'batch_generation_card',
        }}
      />,
    );

    expect(screen.getByText(/Estimated cost: 5 credits/i)).toBeInTheDocument();
    expect(
      screen.getByText(/flat batch fee, not per post/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/200 credits/i)).not.toBeInTheDocument();
  });

  it('honors an explicit creditEstimate from the action', () => {
    render(
      <BatchGenerationCard
        action={{
          batchCount: 20,
          creditEstimate: 12,
          id: 'batch-form-2',
          platforms: ['twitter'],
          title: 'Batch generation',
          type: 'batch_generation_card',
        }}
      />,
    );

    expect(screen.getByText(/Estimated cost: 12 credits/i)).toBeInTheDocument();
  });

  it('submits the selected count and platforms', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();

    render(
      <BatchGenerationCard
        action={{
          batchCount: 5,
          id: 'batch-form-3',
          platforms: ['twitter'],
          title: 'Batch generation',
          type: 'batch_generation_card',
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
});

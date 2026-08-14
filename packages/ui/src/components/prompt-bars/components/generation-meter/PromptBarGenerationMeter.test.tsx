import { render, screen } from '@testing-library/react';
import PromptBarGenerationMeter from '@ui/prompt-bars/components/generation-meter/PromptBarGenerationMeter';
import { describe, expect, it } from 'vitest';

describe('PromptBarGenerationMeter', () => {
  it('renders the resolved label and accessible name', () => {
    render(
      <PromptBarGenerationMeter
        meter={{
          ariaLabel: 'About 12 credits. 2 generations queued',
          credits: 12,
          isEstimate: true,
          label: '~12 cr · 2 queued',
          queuedCount: 2,
        }}
      />,
    );

    const meter = screen.getByTestId('studio-generation-meter');
    expect(meter).toHaveTextContent('~12 cr · 2 queued');
    expect(meter).toHaveAttribute(
      'aria-label',
      'About 12 credits. 2 generations queued',
    );
    expect(meter.textContent?.toLowerCase()).not.toContain('unlimited');
  });
});

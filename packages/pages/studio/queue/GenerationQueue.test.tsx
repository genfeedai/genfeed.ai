import { IngredientStatus } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import GenerationQueue from './GenerationQueue';

describe('GenerationQueue', () => {
  it('renders nothing when there are no queued generations', () => {
    const { container } = render(<GenerationQueue generations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders ETA, phase, and reassurance for long-running processing items', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T10:05:00.000Z'));

    render(
      <GenerationQueue
        generations={[
          {
            currentPhase: 'Generating',
            estimatedDurationMs: 180_000,
            etaConfidence: 'low',
            id: 'gen-1',
            model: 'veo-3',
            prompt: 'Create a cinematic avatar intro',
            remainingDurationMs: 120_000,
            startTime: new Date('2026-03-12T10:00:00.000Z'),
            status: [IngredientStatus.PROCESSING],
            type: 'video',
          },
        ]}
      />,
    );

    expect(screen.getByText('Generating')).toBeInTheDocument();
    expect(screen.getByText('Usually 2-4 min')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You can keep working. We’ll notify you when it’s ready.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('5:00 elapsed')).toBeInTheDocument();

    vi.useRealTimers();
  });
});

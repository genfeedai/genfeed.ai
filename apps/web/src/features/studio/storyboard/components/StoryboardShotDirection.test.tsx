import type {
  StoryboardPlan,
  StoryboardShot,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardShotDirection from './StoryboardShotDirection';

vi.mock('next-intl', async () => {
  const { translateFromCatalog: catalog } = await import(
    '@app-tests/next-intl.stub'
  );
  return { useTranslations: catalog };
});

const shot: StoryboardShot = {
  id: 'shot-1',
  ordinal: 1,
  action: 'Mia checks the clock.',
  onScreenSpeaker: false,
  durationSeconds: 6,
  stillAssetId: 'still-1',
  stillFreshness: 'fresh',
  transition: 'cut',
  cuts: [{ startSeconds: 0, endSeconds: 2, framing: 'Close-up on the clock' }],
  sfx: ['ticking clock'],
  referenceRoles: [
    { assetId: 'room-1', role: 'environment', label: 'Kitchen' },
  ],
};

const plan: StoryboardPlan = {
  videoModelKey: null,
  title: 'Late',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: 30,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [shot],
};

function renderDirection(
  overrides: Partial<Parameters<typeof StoryboardShotDirection>[0]> = {},
) {
  const onPatch = vi.fn();
  render(
    <StoryboardShotDirection
      plan={plan}
      shot={shot}
      model={{ label: 'Cine 2', maxReferences: 4, hasAudio: true }}
      referenceUrls={{}}
      isDisabled={false}
      onPatch={onPatch}
      onAddReference={vi.fn()}
      {...overrides}
    />,
  );
  return { onPatch };
}

describe('StoryboardShotDirection', () => {
  it('shows the prompt compiled for the storyboard model before any spend', () => {
    renderDirection();
    expect(screen.getByLabelText('Video prompt')).toHaveValue(
      'Reference images: image 1 is the opening frame; image 2 is the environment (Kitchen). Mia checks the clock. 0-2s: Close-up on the clock. Sound effects: ticking clock.',
    );
    expect(
      screen.getByText('Compiled for Cine 2. Edit it to write your own.'),
    ).toBeInTheDocument();
  });

  it('warns when the shot names more images than the model accepts', () => {
    renderDirection({
      model: { label: 'Cine 2', maxReferences: 1, hasAudio: true },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This shot names 2 reference images; Cine 2 accepts 1.',
    );
  });

  it('keeps an edited prompt as the shot’s own', () => {
    const { onPatch } = renderDirection();
    fireEvent.change(screen.getByLabelText('Video prompt'), {
      target: { value: 'Handheld, rain on the window.' },
    });
    expect(onPatch).toHaveBeenLastCalledWith({
      videoPrompt: 'Handheld, rain on the window.',
    });
  });

  it('saves sound effects as a list when the field is left', () => {
    const { onPatch } = renderDirection();
    const field = screen.getByLabelText('Sound effects');
    fireEvent.change(field, {
      target: { value: 'ticking clock, door slam, ' },
    });
    fireEvent.blur(field);
    expect(onPatch).toHaveBeenLastCalledWith({
      sfx: ['ticking clock', 'door slam'],
    });
  });
});

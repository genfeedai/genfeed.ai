import type { StoryboardCharacterReplacement } from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoryboardCharacterReplace from './StoryboardCharacterReplace';

const replaceStoryboardCharacter = vi.hoisted(() => vi.fn());

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: () => ({ openGallery: vi.fn() }),
  }),
);
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ replaceStoryboardCharacter }),
}));

const saved: StoryboardCharacterReplacement = {
  chargedCredits: 0,
  imageAssetIds: ['image-1'],
  limitations: [
    'Does not preserve the source audio track.',
    'Does not guarantee lip-sync.',
    'Does not charge credits. Genjutsu stays inactive at cost 0.',
  ],
  modelKey: 'higgsfield/genjutsu/motion-transfer/v1.0',
  requestId: 'req-saved',
  shotId: 'shot-1',
  status: 'submitted',
  videoAssetId: 'video-1',
};

describe('StoryboardCharacterReplace', () => {
  it('shows the saved request and the Genjutsu limits', () => {
    render(
      <StoryboardCharacterReplace
        brandId="brand-1"
        runId="run-1"
        shotId="shot-1"
        saved={saved}
      />,
    );

    expect(
      screen.getByText(/Does not preserve the source audio track/i),
    ).toBeTruthy();
    expect(screen.getByText(/Does not guarantee lip-sync/i)).toBeTruthy();
    expect(screen.getByText(/Does not charge credits/i)).toBeTruthy();
    expect(screen.getByText(/req-saved/)).toBeTruthy();
    expect(screen.getByText(/Charged credits: 0/)).toBeTruthy();
  });

  it('submits the selected images and reports a generic failure', async () => {
    replaceStoryboardCharacter.mockRejectedValueOnce(
      new Error('https://provider.example/secret'),
    );
    render(
      <StoryboardCharacterReplace
        brandId="brand-1"
        runId="run-1"
        shotId="shot-1"
        saved={saved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace character' }));

    await waitFor(() => {
      expect(replaceStoryboardCharacter).toHaveBeenCalledWith(
        'brand-1',
        'run-1',
        'shot-1',
        { imageAssetIds: ['image-1'] },
      );
    });
    expect(
      screen.getByText('Character replace did not start. Nothing was charged.'),
    ).toBeTruthy();
    expect(screen.queryByText(/provider\.example/)).toBeNull();
  });
});

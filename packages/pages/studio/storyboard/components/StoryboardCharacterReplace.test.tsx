import type { StoryboardCharacterReplacement } from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StoryboardCharacterReplace from './StoryboardCharacterReplace';

const {
  replaceStoryboardCharacter,
  listStoryboardCharacterReplacements,
  getStoryboardCharacterReplacementStatus,
  getService,
  useService,
  openGallery,
} = vi.hoisted(() => ({
  replaceStoryboardCharacter: vi.fn(),
  listStoryboardCharacterReplacements: vi.fn(),
  getStoryboardCharacterReplacementStatus: vi.fn(),
  getService: vi.fn(),
  useService: vi.fn(),
  openGallery: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  useService.mockReturnValue(getService);
  listStoryboardCharacterReplacements.mockResolvedValue({
    operations: [],
    legacyReplacements: [],
  });
  getService.mockResolvedValue({
    replaceStoryboardCharacter,
    listStoryboardCharacterReplacements,
    getStoryboardCharacterReplacementStatus,
  });
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: () => ({ openGallery }),
  }),
);
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => useService(),
}));

const saved: StoryboardCharacterReplacement = {
  chargedCredits: 0,
  imageAssetIds: ['image-1'],
  limitations: [
    'Does not preserve the source audio track.',
    'Does not guarantee lip-sync.',
    'This operation records zero application credits.',
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
    expect(screen.getByText(/records zero application credits/i)).toBeTruthy();
    expect(screen.getByText(/req-saved/)).toBeTruthy();
    expect(screen.getByText(/Application credits recorded: 0/)).toBeTruthy();
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
      screen.getByText(
        'The request could not be confirmed. Refresh requests to check its status.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/provider\.example/)).toBeNull();
  });
});

describe('saved receipt inspection', () => {
  const operation = {
    ...saved,
    operationId: 'f22c0c2f-59fa-41d8-b393-a808f65e0b52',
    runId: 'run-1',
    acceptedRequestIds: ['req-saved', 'req-second'],
    association: 'detached',
  };
  it('shows unknown IDs and allows saved-status reads while generation is disabled', async () => {
    const { requestId: _id, ...unknown } = operation;
    listStoryboardCharacterReplacements.mockResolvedValue({
      operations: [{ ...unknown, acceptedRequestIds: [] }],
      legacyReplacements: [],
    });
    getStoryboardCharacterReplacementStatus.mockResolvedValue({
      ...unknown,
      acceptedRequestIds: [],
    });
    render(
      <StoryboardCharacterReplace
        brandId="brand-1"
        runId="run-1"
        shotId="shot-1"
        isDisabled
      />,
    );
    expect(
      await screen.findByText('Provider request ID not yet available'),
    ).toBeTruthy();
    expect(screen.getByText(`Operation ${operation.operationId}`)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh saved status' }),
    );
    await waitFor(() =>
      expect(getStoryboardCharacterReplacementStatus).toHaveBeenCalledTimes(1),
    );
    expect(replaceStoryboardCharacter).not.toHaveBeenCalled();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });
  it.each([
    'https://fixture.invalid/result',
    'http://fixture.invalid/result',
    'javascript:alert(1)',
    'https://user:secret@fixture.invalid/result',
  ])('inspects temporary result %s safely', async (url) => {
    listStoryboardCharacterReplacements.mockResolvedValue({
      operations: [
        {
          ...operation,
          status: 'ready',
          output: { kind: 'provider_url', url, retained: false },
          errorCode: 'private https://provider.invalid/secret',
        },
      ],
      legacyReplacements: [],
    });
    render(
      <StoryboardCharacterReplace
        brandId="brand-1"
        runId="run-1"
        shotId="shot-1"
      />,
    );
    expect(await screen.findByText('Request req-second')).toBeTruthy();
    expect(
      screen.getByText('This result has not been saved to Library.'),
    ).toBeTruthy();
    expect(screen.getByText('This request needs attention.')).toBeTruthy();
    expect(screen.queryByText(/provider.invalid/)).toBeNull();
    const link = screen.queryByRole('link', {
      name: 'Open temporary provider result',
    });
    if (url === 'https://fixture.invalid/result') {
      expect(link?.getAttribute('href')).toBe(url);
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    } else expect(link).toBeNull();
    expect(replaceStoryboardCharacter).not.toHaveBeenCalled();
  });
  it('historical cache rows retain safe output without offering operation refresh', async () => {
    listStoryboardCharacterReplacements.mockResolvedValue({
      operations: [],
      legacyReplacements: [
        {
          ...saved,
          operationId: operation.operationId,
          output: {
            kind: 'provider_url',
            url: 'https://fixture.invalid/result',
            retained: false,
          },
        },
      ],
    });
    render(
      <StoryboardCharacterReplace
        brandId="brand-1"
        runId="run-1"
        shotId="shot-1"
      />,
    );
    expect(await screen.findByText('Historical request')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh status' })).toBeNull();
    expect(screen.queryByText(/Operation /)).toBeNull();
  });
  it('resets form on scope change and preserves user edits on same-scope saved updates', async () => {
    const { rerender } = render(
      <StoryboardCharacterReplace
        brandId="brand-1"
        runId="run-1"
        shotId="shot-1"
        saved={{ ...saved, prompt: 'Original' }}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'User edit' },
    });
    rerender(
      <StoryboardCharacterReplace
        brandId="brand-1"
        runId="run-1"
        shotId="shot-1"
        saved={{ ...saved, prompt: 'Saved changed' }}
      />,
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'User edit',
    );
    rerender(
      <StoryboardCharacterReplace
        brandId="brand-1"
        runId="run-2"
        shotId="shot-2"
        saved={{ ...saved, shotId: 'shot-2', prompt: 'New shot' }}
      />,
    );
    await waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
        'New shot',
      ),
    );
    expect(replaceStoryboardCharacter).not.toHaveBeenCalled();
  });
});

it('clears auth-scoped form controls and rejects an old gallery callback after identity A to B to A', async () => {
  const input = {
    brandId: 'brand-1',
    runId: 'run-1',
    shotId: 'shot-1',
    saved: { ...saved, prompt: 'Actor A prompt' },
  };
  const { rerender } = render(<StoryboardCharacterReplace {...input} />);
  await waitFor(() =>
    expect(listStoryboardCharacterReplacements).toHaveBeenCalledTimes(1),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Choose character images' }),
  );
  const oldSelection = openGallery.mock.calls[0][0].onSelect;
  const actorB = vi.fn(async () => ({
    replaceStoryboardCharacter,
    listStoryboardCharacterReplacements,
    getStoryboardCharacterReplacementStatus,
  }));
  useService.mockReturnValue(actorB);
  rerender(<StoryboardCharacterReplace {...input} />);
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  expect(screen.queryByText(/req-saved/)).toBeNull();
  expect(
    (
      screen.getByRole('button', {
        name: 'Replace character',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  useService.mockReturnValue(getService);
  rerender(<StoryboardCharacterReplace {...input} />);
  oldSelection([{ id: 'old-image', brandId: 'brand-1', isDeleted: false }]);
  expect(screen.queryByText(/character images selected/)).toBeNull();
  expect(
    (
      screen.getByRole('button', {
        name: 'Replace character',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(replaceStoryboardCharacter).not.toHaveBeenCalled();
});

import { RouterPriority } from '@genfeedai/enums';
import type {
  IStudioLook,
  StudioGenerateSettings,
} from '@genfeedai/interfaces';
import StudioLooksPanel from '@pages/studio/generate/components/StudioLooksPanel';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteLook: vi.fn(),
  saveLook: vi.fn(),
  useStudioLooks: vi.fn(),
}));

vi.mock('@pages/studio/generate/hooks/useStudioLooks', async () => {
  const actual = await vi.importActual<
    typeof import('@pages/studio/generate/hooks/useStudioLooks')
  >('@pages/studio/generate/hooks/useStudioLooks');
  return { ...actual, useStudioLooks: mocks.useStudioLooks };
});

const settings: StudioGenerateSettings = {
  aspectRatio: '1:1',
  blacklist: [],
  brandingMode: 'brand',
  isAudioEnabled: false,
  modelKey: 'model-1',
  outputs: 1,
  prioritize: RouterPriority.BALANCED,
  resolution: '1K',
  tags: [],
};

const look: IStudioLook = {
  assetType: 'image',
  brandId: 'brand-1',
  camera: 'camera-1',
  cameraMovement: null,
  createdAt: '2026-08-26T00:00:00.000Z',
  id: 'look-1',
  isDeleted: false,
  label: 'Editorial',
  lens: 'lens-1',
  lighting: 'lighting-1',
  mood: 'mood-1',
  organizationId: 'org-1',
  promptTemplate: 'preset-1',
  scene: 'scene-1',
  style: 'style-1',
  updatedAt: '2026-08-26T00:00:00.000Z',
  userId: 'user-1',
};

describe('StudioLooksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteLook.mockResolvedValue(true);
    mocks.saveLook.mockResolvedValue(true);
    mocks.useStudioLooks.mockReturnValue({
      deleteLook: mocks.deleteLook,
      deletingId: null,
      error: null,
      isLoading: false,
      isSaving: false,
      looks: [look],
      saveLook: mocks.saveLook,
    });
  });

  it('applies only the complete saved Look patch', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <StudioLooksPanel onApply={onApply} settings={settings} type="image" />,
    );

    await user.click(screen.getByRole('button', { name: 'Apply Editorial' }));

    expect(onApply).toHaveBeenCalledWith({
      camera: 'camera-1',
      cameraMovement: undefined,
      lens: 'lens-1',
      lighting: 'lighting-1',
      mood: 'mood-1',
      promptTemplate: 'preset-1',
      scene: 'scene-1',
      style: 'style-1',
    });
  });

  it('keeps the entered name and current settings when save fails', async () => {
    const user = userEvent.setup();
    mocks.saveLook.mockResolvedValueOnce(false);
    render(
      <StudioLooksPanel onApply={vi.fn()} settings={settings} type="image" />,
    );

    const input = screen.getByLabelText('Look name');
    await user.type(input, 'My Look');
    await user.click(screen.getByRole('button', { name: 'Save Look' }));

    await waitFor(() =>
      expect(mocks.saveLook).toHaveBeenCalledWith('My Look', settings),
    );
    expect(input).toHaveValue('My Look');
  });

  it('requests a recoverable delete for the selected Look', async () => {
    const user = userEvent.setup();
    render(
      <StudioLooksPanel onApply={vi.fn()} settings={settings} type="image" />,
    );

    await user.click(screen.getByRole('button', { name: 'Delete Editorial' }));

    expect(mocks.deleteLook).toHaveBeenCalledWith('look-1');
  });
});

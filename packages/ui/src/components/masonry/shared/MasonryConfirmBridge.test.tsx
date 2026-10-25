import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { VideoUpscaleModelOption } from '@genfeedai/hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.cost !== undefined ? `${key}:${values.cost}` : key,
}));

vi.mock('@ui/modals/ingredients/VideoUpscaleConfirmControls', () => ({
  default: () => <div data-testid="upscale-controls" />,
  getDefaultVideoUpscaleSelection: (options: VideoUpscaleModelOption[]) =>
    options[0]
      ? {
          cost: options[0].cost,
          model: options[0].key,
          targetFps: 30,
          targetResolution: '1080p',
        }
      : undefined,
}));

vi.mock('@ui/modals/ingredients/VideoExtendConfirmControls', () => ({
  default: () => <div data-testid="extend-controls" />,
  getDefaultVideoExtendSelection: () => ({
    cost: 40,
    duration: 5,
    model: 'extend-model',
    prompt: '',
  }),
}));

const modelOptions: VideoUpscaleModelOption[] = [
  {
    cost: 100,
    fps: [30],
    key: 'topaz',
    label: 'Topaz',
    resolutions: ['1080p'],
  },
];

const sourceVideo = { id: 'video-1' } as IIngredient;

describe('MasonryConfirmBridge', () => {
  const defaultProps = {
    clearUpscaleConfirm: vi.fn(),
    executeUpscale: vi.fn().mockResolvedValue(undefined),
    upscaleConfirmData: null,
  };

  it('renders nothing while no video action is pending', () => {
    render(<MasonryConfirmBridge {...defaultProps} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the upscale price on the action and starts with the selection', async () => {
    const executeUpscale = vi.fn().mockResolvedValue(undefined);
    const clearUpscaleConfirm = vi.fn();
    render(
      <MasonryConfirmBridge
        clearUpscaleConfirm={clearUpscaleConfirm}
        executeUpscale={executeUpscale}
        upscaleConfirmData={{
          cost: 100,
          ingredient: null,
          modelKey: 'topaz',
          videoModelOptions: modelOptions,
        }}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'dialogLabel' })).toBeVisible();
    expect(screen.getByTestId('upscale-controls')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'confirmAction:100' }));

    await waitFor(() =>
      expect(executeUpscale).toHaveBeenCalledWith({
        cost: 100,
        model: 'topaz',
        targetFps: 30,
        targetResolution: '1080p',
      }),
    );
    expect(clearUpscaleConfirm).toHaveBeenCalledTimes(1);
  });

  it('opens the extend pickers when only an extension is pending', async () => {
    const executeExtend = vi.fn().mockResolvedValue(undefined);
    const clearExtendConfirm = vi.fn();
    render(
      <MasonryConfirmBridge
        {...defaultProps}
        clearExtendConfirm={clearExtendConfirm}
        executeExtend={executeExtend}
        extendConfirmData={{ ingredient: sourceVideo, modelOptions: [] }}
      />,
    );

    expect(screen.getByTestId('extend-controls')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'confirmAction:40' }));

    await waitFor(() =>
      expect(executeExtend).toHaveBeenCalledWith({
        cost: 40,
        duration: 5,
        model: 'extend-model',
        prompt: '',
      }),
    );
    expect(clearExtendConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes without starting anything on Escape', () => {
    const executeUpscale = vi.fn();
    const clearUpscaleConfirm = vi.fn();
    render(
      <MasonryConfirmBridge
        clearUpscaleConfirm={clearUpscaleConfirm}
        executeUpscale={executeUpscale}
        upscaleConfirmData={{
          cost: 100,
          ingredient: null,
          modelKey: 'topaz',
          videoModelOptions: modelOptions,
        }}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(clearUpscaleConfirm).toHaveBeenCalledTimes(1);
    expect(executeUpscale).not.toHaveBeenCalled();
  });
});

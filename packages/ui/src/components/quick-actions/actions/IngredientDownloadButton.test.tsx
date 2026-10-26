import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import IngredientDownloadButton from '@ui/quick-actions/actions/IngredientDownloadButton';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadWatermarked, notifyError } = vi.hoisted(() => ({
  downloadWatermarked: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ downloadWatermarked }),
}));
vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: vi.fn() },
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: notifyError }) },
}));

describe('IngredientDownloadButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('keeps the original as the direct action', async () => {
    const original = vi.fn();
    render(
      <IngredientDownloadButton
        ingredientId="image-1"
        onDownloadOriginal={original}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'original' }));
    await waitFor(() => expect(original).toHaveBeenCalledOnce());
    expect(downloadWatermarked).not.toHaveBeenCalled();
  });
  it('downloads the server-created watermark variant from the dropdown', async () => {
    downloadWatermarked.mockResolvedValue(undefined);
    const original = vi.fn();
    render(
      <IngredientDownloadButton
        ingredientId="image-1"
        onDownloadOriginal={original}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'branded' }));
    await waitFor(() =>
      expect(downloadWatermarked).toHaveBeenCalledWith('image-1'),
    );
    expect(original).not.toHaveBeenCalled();
  });
  it('does not bubble portal menu clicks or pointer events to the media tile', async () => {
    downloadWatermarked.mockResolvedValue(undefined);
    const openTile = vi.fn();
    const selectTile = vi.fn();
    render(
      <div role="presentation" onClick={openTile} onPointerDown={selectTile}>
        <IngredientDownloadButton
          ingredientId="image-1"
          onDownloadOriginal={vi.fn()}
        />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
      button: 0,
    });
    openTile.mockClear();
    selectTile.mockClear();
    const item = await screen.findByRole('menuitem', { name: 'branded' });
    fireEvent.pointerDown(item, { button: 0 });
    fireEvent.click(item);
    await waitFor(() => expect(downloadWatermarked).toHaveBeenCalled());
    expect(openTile).not.toHaveBeenCalled();
    expect(selectTile).not.toHaveBeenCalled();
  });

  it('reports failed watermark exports without downloading an original', async () => {
    downloadWatermarked.mockRejectedValue(new Error('missing watermark'));
    const original = vi.fn();
    render(
      <IngredientDownloadButton
        ingredientId="video-1"
        onDownloadOriginal={original}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'branded' }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('errorTitle', {
        description: 'watermarkError',
        duration: 10_000,
      }),
    );
    expect(original).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'original' })).toBeEnabled();
  });

  it('shows the reason the API gave when a watermark export is refused', async () => {
    const refused = new Error('Configure a watermark in brand settings first');
    refused.name = 'WatermarkExportError';
    downloadWatermarked.mockRejectedValue(refused);
    render(
      <IngredientDownloadButton
        ingredientId="image-1"
        onDownloadOriginal={vi.fn()}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'branded' }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('errorTitle', {
        description: 'Configure a watermark in brand settings first',
        duration: 10_000,
      }),
    );
  });

  it('renders a single trigger that opens the dropdown in compact mode', async () => {
    downloadWatermarked.mockResolvedValue(undefined);
    const original = vi.fn();
    render(
      <IngredientDownloadButton
        ingredientId="image-1"
        onDownloadOriginal={original}
        isCompact
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'original' }),
    ).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'original' }));
    await waitFor(() => expect(original).toHaveBeenCalledOnce());
    expect(downloadWatermarked).not.toHaveBeenCalled();
  });

  it('matches the compact overlay icon square without a focus ring', () => {
    render(
      <IngredientDownloadButton
        ingredientId="image-1"
        onDownloadOriginal={vi.fn()}
        isCompact
      />,
    );

    const trigger = screen.getByRole('button', { name: 'options' });
    expect(trigger).toHaveClass('size-7');
    expect(trigger.className).toContain('focus-visible:bg-hover');
    expect(trigger.className).not.toContain('ring-ring');
  });

  it('swaps the download icon for the spinner while downloading instead of drawing both', async () => {
    let finish: () => void = () => undefined;
    const original = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <IngredientDownloadButton
        ingredientId="image-1"
        onDownloadOriginal={original}
        isCompact
      />,
    );
    const trigger = screen.getByRole('button', { name: 'options' });
    expect(trigger.querySelector('.lucide-download')).toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0 });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'original' }));

    await waitFor(() => expect(trigger).toBeDisabled());
    expect(trigger.querySelector('.lucide-download')).not.toBeInTheDocument();
    expect(trigger.querySelectorAll('svg')).toHaveLength(1);

    finish();
    await waitFor(() => expect(trigger).toBeEnabled());
    expect(trigger.querySelector('.lucide-download')).toBeInTheDocument();
  });

  it('never locks the original behind a plan', async () => {
    render(
      <IngredientDownloadButton
        ingredientId="image-1"
        onDownloadOriginal={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'original' })).toBeEnabled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
      button: 0,
    });
    const item = await screen.findByRole('menuitem', { name: 'original' });
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    expect(item).not.toHaveTextContent('upgradeHint');
  });
});

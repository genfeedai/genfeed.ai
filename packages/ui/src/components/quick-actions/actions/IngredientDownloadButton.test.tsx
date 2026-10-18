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

  describe('canDownloadOriginal entitlement gate', () => {
    it('disables the standalone Original button and never calls the callback', async () => {
      const original = vi.fn();
      render(
        <IngredientDownloadButton
          ingredientId="image-1"
          onDownloadOriginal={original}
          canDownloadOriginal={false}
        />,
      );
      const trigger = screen.getByRole('button', { name: 'original' });
      expect(trigger).toBeDisabled();
      fireEvent.click(trigger);
      await Promise.resolve();
      expect(original).not.toHaveBeenCalled();
    });

    it('disables the Original menu item in the split dropdown', async () => {
      const original = vi.fn();
      render(
        <IngredientDownloadButton
          ingredientId="image-1"
          onDownloadOriginal={original}
          canDownloadOriginal={false}
        />,
      );
      fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
        button: 0,
      });
      const item = await screen.findByRole('menuitem', { name: /original/i });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
      await Promise.resolve();
      expect(original).not.toHaveBeenCalled();
    });

    it('disables the Original menu item in compact mode', async () => {
      const original = vi.fn();
      render(
        <IngredientDownloadButton
          ingredientId="image-1"
          onDownloadOriginal={original}
          canDownloadOriginal={false}
          isCompact
        />,
      );
      fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
        button: 0,
      });
      const item = await screen.findByRole('menuitem', { name: /original/i });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
      await Promise.resolve();
      expect(original).not.toHaveBeenCalled();
    });

    it('shows the upgrade tooltip from a focusable wrapper around the locked button', async () => {
      render(
        <IngredientDownloadButton
          ingredientId="image-1"
          onDownloadOriginal={vi.fn()}
          canDownloadOriginal={false}
        />,
      );
      const wrapper = screen.getByRole('button', { name: 'originalLocked' });
      expect(wrapper).toHaveAttribute('tabIndex', '0');
      expect(wrapper).not.toHaveAttribute('disabled');
      expect(wrapper).toContainElement(
        screen.getByRole('button', { name: 'original' }),
      );
      fireEvent.keyDown(document.body, { key: 'Tab' });
      fireEvent.focus(wrapper);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'originalLocked',
      );
    });

    it('shows an upgrade hint on the locked Original menu item', async () => {
      render(
        <IngredientDownloadButton
          ingredientId="image-1"
          onDownloadOriginal={vi.fn()}
          canDownloadOriginal={false}
        />,
      );
      fireEvent.pointerDown(screen.getByRole('button', { name: 'options' }), {
        button: 0,
      });
      const item = await screen.findByRole('menuitem', { name: /original/i });
      expect(item).toHaveTextContent('upgradeHint');
    });

    it('renders no locked wrapper when the original is available', () => {
      render(
        <IngredientDownloadButton
          ingredientId="image-1"
          onDownloadOriginal={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole('button', { name: 'originalLocked' }),
      ).not.toBeInTheDocument();
    });

    it('keeps the original action enabled when canDownloadOriginal is omitted (default true)', async () => {
      const original = vi.fn();
      render(
        <IngredientDownloadButton
          ingredientId="image-1"
          onDownloadOriginal={original}
        />,
      );
      const trigger = screen.getByRole('button', { name: 'original' });
      expect(trigger).toBeEnabled();
      fireEvent.click(trigger);
      await waitFor(() => expect(original).toHaveBeenCalledOnce());
    });
  });
});

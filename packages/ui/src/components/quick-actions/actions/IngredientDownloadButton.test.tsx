import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import IngredientDownloadButton from '@ui/quick-actions/actions/IngredientDownloadButton';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exportMedia, downloadUrl, notifyError } = vi.hoisted(() => ({
  exportMedia: vi.fn(),
  downloadUrl: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ exportMedia }),
}));
vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: vi.fn() },
}));
vi.mock('@genfeedai/helpers/media/download/download.helper', () => ({
  downloadUrl,
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
    expect(exportMedia).not.toHaveBeenCalled();
  });
  it('downloads the server-created watermark variant from the dropdown', async () => {
    exportMedia.mockResolvedValue({
      url: 'https://cdn.example/preview.png',
      filename: 'preview.png',
    });
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
      expect(downloadUrl).toHaveBeenCalledWith(
        'https://cdn.example/preview.png',
        'preview.png',
      ),
    );
    expect(exportMedia).toHaveBeenCalledWith('image-1', true);
    expect(original).not.toHaveBeenCalled();
  });
  it('reports failed watermark exports without downloading an original', async () => {
    exportMedia.mockRejectedValue(new Error('missing watermark'));
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
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('error'));
    expect(original).not.toHaveBeenCalled();
    expect(downloadUrl).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'original' })).toBeEnabled();
  });
});

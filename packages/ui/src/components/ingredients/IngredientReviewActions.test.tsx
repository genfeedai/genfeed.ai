import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientReviewActions from './IngredientReviewActions';

const { patch, notifyError } = vi.hoisted(() => ({
  patch: vi.fn(),
  notifyError: vi.fn(),
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ patch }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: notifyError }) },
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const ingredient = {
  id: 'asset-1',
  category: IngredientCategory.IMAGE,
  status: IngredientStatus.GENERATED,
} as IIngredient;

describe('IngredientReviewActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['Approve asset', IngredientStatus.VALIDATED],
    ['Reject asset', IngredientStatus.REJECTED],
  ])('persists %s without opening the asset', async (label, status) => {
    const updated = { ...ingredient, status };
    patch.mockResolvedValue(updated);
    const onUpdated = vi.fn();
    const refresh = vi.fn();
    window.addEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refresh);
    render(
      <IngredientReviewActions ingredient={ingredient} onUpdated={onUpdated} />,
    );
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(patch).toHaveBeenCalledExactlyOnceWith(ingredient.id, { status });
    expect(refresh).toHaveBeenCalledOnce();
    window.removeEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refresh);
  });

  it('keeps the asset unchanged on failure and allows retry', async () => {
    patch.mockRejectedValue(new Error('Unavailable'));
    const onUpdated = vi.fn();
    render(
      <IngredientReviewActions ingredient={ingredient} onUpdated={onUpdated} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reject asset' }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledOnce());
    expect(onUpdated).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reject asset' })).toBeEnabled();
  });

  it('disables both decisions while a review is saving', async () => {
    let finish: ((value: IIngredient) => void) | undefined;
    patch.mockImplementation(
      () =>
        new Promise<IIngredient>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <IngredientReviewActions ingredient={ingredient} onUpdated={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve asset' }));
    await waitFor(() => expect(patch).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Reject asset' })).toBeDisabled();
    finish?.({ ...ingredient, status: IngredientStatus.VALIDATED });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Reject asset' }),
      ).toBeEnabled(),
    );
  });

  it.each([
    IngredientStatus.PROCESSING,
    IngredientStatus.FAILED,
    IngredientStatus.REJECTED,
  ])('cannot review a %s asset', (status) => {
    render(
      <IngredientReviewActions
        ingredient={{ ...ingredient, status }}
        onUpdated={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});

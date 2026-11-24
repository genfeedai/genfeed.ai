import {
  CredentialPlatform,
  IngredientCategory,
  IngredientStatus,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import type { StatusDropdownProps } from '@genfeedai/props/social/status-dropdown.props';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockPostsFindOne,
  mockPostsPatch,
  mockIngredientPatch,
  mockImageFindOne,
} = vi.hoisted(() => ({
  mockIngredientPatch: vi.fn(),
  mockImageFindOne: vi.fn(),
  mockPostsFindOne: vi.fn(),
  mockPostsPatch: vi.fn(),
}));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({ patch: mockIngredientPatch }),
  },
}));

vi.mock('@genfeedai/services/ingredients/gifs.service', () => ({
  GIFsService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({ findOne: mockImageFindOne }),
  },
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    return () => Promise.resolve(factory('test-token'));
  },
}));

vi.mock('@genfeedai/services/content/posts.service', () => ({
  PostsService: {
    getInstance: () => ({
      findOne: mockPostsFindOne,
      patch: mockPostsPatch,
    }),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

describe('DropdownStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  const entity = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    status: IngredientStatus.GENERATED,
  } as IIngredient;

  const baseProps: StatusDropdownProps = {
    entity,
    onStatusChange: vi.fn(),
  };

  it('refreshes the filtered Library and counters after rejecting an asset', async () => {
    const updated = { ...entity, status: IngredientStatus.REJECTED };
    mockIngredientPatch.mockResolvedValue(updated);
    mockImageFindOne.mockResolvedValue(updated);
    const onStatusChange = vi.fn();
    const refresh = vi.fn();
    window.addEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refresh);
    try {
      render(
        <DropdownStatus entity={entity} onStatusChange={onStatusChange} />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox', { name: /Change Status/ }));
      await user.click(screen.getByRole('option', { name: 'Rejected' }));
      expect(mockIngredientPatch).toHaveBeenCalledExactlyOnceWith(entity.id, {
        status: IngredientStatus.REJECTED,
      });
      expect(onStatusChange).toHaveBeenCalledWith(
        IngredientStatus.REJECTED,
        updated,
      );
      expect(refresh).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refresh);
    }
  });

  it('paints the trigger as the shared uppercase status badge', () => {
    render(<DropdownStatus {...baseProps} />);

    const trigger = screen.getByRole('combobox', { name: /Change Status/ });
    expect(trigger).toHaveTextContent('Completed');

    expect(trigger).toHaveClass('bg-success/10');
    expect(trigger).toHaveClass('text-success');
    expect(trigger.className).toMatch(/\buppercase\b/);
    expect(trigger.className).not.toMatch(/bg-primary\/15/);
  });

  it('patches posts with canonical execution state and visibility', async () => {
    mockPostsPatch.mockResolvedValue({});
    mockPostsFindOne.mockResolvedValue({
      id: 'post-1',
      platform: CredentialPlatform.TWITTER,
      scheduledDate: '2026-08-14T10:00:00.000Z',
      status: PostStatus.PUBLIC,
    });

    const postEntity = {
      id: 'post-1',
      platform: CredentialPlatform.TWITTER,
      scheduledDate: '2026-08-14T10:00:00.000Z',
      status: PostStatus.DRAFT,
    } as IPost;

    render(<DropdownStatus entity={postEntity} onStatusChange={vi.fn()} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: /Change Status/ }));
    await user.click(screen.getByRole('option', { name: 'Public' }));

    expect(mockPostsPatch).toHaveBeenCalledWith('post-1', {
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PUBLIC,
    });
    expect(mockPostsPatch.mock.calls[0]?.[1]).not.toHaveProperty('status');
  });
});

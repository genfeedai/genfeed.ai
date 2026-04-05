import type { IIngredient } from '@genfeedai/interfaces';
import { IngredientCategory, IngredientExtension } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import IngredientTabsInfo from '@ui/ingredients/tabs/info/IngredientTabsInfo';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: 'org-1',
    refreshBrands: vi.fn(),
    selectedBrand: { id: 'brand-1' },
  })),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    refresh: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('IngredientTabsInfo', () => {
  const ingredient = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    metadata: {
      description: 'Description',
      extension: IngredientExtension.JPG,
      label: 'Test Ingredient',
    },
  } as IIngredient;

  it('renders visible metadata fields immediately', () => {
    render(<IngredientTabsInfo ingredient={ingredient} />);

    expect(screen.getByText('Core Metadata')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Ingredient')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Description')).toBeInTheDocument();
  });

  it('saves the label on blur', async () => {
    const onUpdateMetadata = vi.fn().mockResolvedValue(undefined);

    render(
      <IngredientTabsInfo
        ingredient={ingredient}
        onUpdateMetadata={onUpdateMetadata}
      />,
    );

    const labelInput = screen.getByDisplayValue('Test Ingredient');

    fireEvent.change(labelInput, { target: { value: 'Updated Label' } });
    fireEvent.blur(labelInput);

    await waitFor(() => {
      expect(onUpdateMetadata).toHaveBeenCalledWith('label', 'Updated Label');
    });
  });

  it('saves the label on Enter', async () => {
    const onUpdateMetadata = vi.fn().mockResolvedValue(undefined);

    render(
      <IngredientTabsInfo
        ingredient={ingredient}
        onUpdateMetadata={onUpdateMetadata}
      />,
    );

    const labelInput = screen.getByDisplayValue('Test Ingredient');

    fireEvent.change(labelInput, { target: { value: 'Keyboard Label' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    await waitFor(() => {
      expect(onUpdateMetadata).toHaveBeenCalledWith('label', 'Keyboard Label');
    });
  });

  it('saves the description on blur', async () => {
    const onUpdateMetadata = vi.fn().mockResolvedValue(undefined);

    render(
      <IngredientTabsInfo
        ingredient={ingredient}
        onUpdateMetadata={onUpdateMetadata}
      />,
    );

    const descriptionInput = screen.getByDisplayValue('Description');

    fireEvent.change(descriptionInput, {
      target: { value: 'Updated Description' },
    });
    fireEvent.blur(descriptionInput);

    await waitFor(() => {
      expect(onUpdateMetadata).toHaveBeenCalledWith(
        'description',
        'Updated Description',
      );
    });
  });

  it('disables both fields while updating', () => {
    render(<IngredientTabsInfo ingredient={ingredient} isUpdating={true} />);

    expect(screen.getByDisplayValue('Test Ingredient')).toBeDisabled();
    expect(screen.getByDisplayValue('Description')).toBeDisabled();
  });

  it('shows avatar actions for image ingredients when update handler exists', () => {
    render(<IngredientTabsInfo ingredient={ingredient} onUpdate={vi.fn()} />);

    expect(screen.getByText('Avatar Actions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark as Avatar' }),
    ).toBeInTheDocument();
  });

  it('shows default avatar actions for avatar source images', () => {
    render(
      <IngredientTabsInfo
        ingredient={{
          ...ingredient,
          category: IngredientCategory.AVATAR,
          metadataExtension: IngredientExtension.JPG,
        }}
        onUpdate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Remove Avatar Type' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Set as Organization Default Avatar',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Set as Brand Default Avatar' }),
    ).toBeInTheDocument();
  });

  it('hides avatar actions for avatar videos', () => {
    render(
      <IngredientTabsInfo
        ingredient={{
          ...ingredient,
          category: IngredientCategory.AVATAR,
          metadataExtension: IngredientExtension.MP4,
        }}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.queryByText('Avatar Actions')).not.toBeInTheDocument();
  });
});

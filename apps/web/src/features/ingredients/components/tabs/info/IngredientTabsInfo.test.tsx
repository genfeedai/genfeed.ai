import { IngredientCategory, IngredientExtension } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import IngredientTabsInfo from '@/features/ingredients/components/tabs/info/IngredientTabsInfo';

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: 'org-1',
    refreshBrands: vi.fn(),
    selectedBrand: { id: 'brand-1' },
  })),
}));

vi.mock('@/hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    refresh: vi.fn(),
  })),
}));

const { patchIngredient } = vi.hoisted(() => ({
  patchIngredient: vi.fn(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn(async () => ({ patch: patchIngredient })),
  ),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  const { default: ui } = await import('../../../../../../messages/en/ui.json');
  return { useTranslations: createTranslateFromCatalog({ ui }) };
});

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
    const { container } = render(
      <IngredientTabsInfo ingredient={ingredient} />,
    );

    expect(screen.queryByText('Core Metadata')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Label' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Ingredient')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Description')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(
      /\b(?:bg|border|text)-(?:black|white)(?:\b|\/|\[)/,
    );
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

  describe('alt text', () => {
    const image = { ...ingredient, altText: 'A red bicycle' } as IIngredient;

    beforeEach(() => {
      patchIngredient.mockReset();
    });

    it('shows the saved alt text of an image', () => {
      render(<IngredientTabsInfo ingredient={image} onUpdate={vi.fn()} />);

      expect(screen.getByRole('textbox', { name: 'Alt text' })).toHaveValue(
        'A red bicycle',
      );
    });

    it('saves the trimmed alt text on blur and hands back the updated image', async () => {
      const updated = { ...image, altText: 'A blue bicycle' } as IIngredient;
      patchIngredient.mockResolvedValue(updated);
      const onUpdate = vi.fn();

      render(<IngredientTabsInfo ingredient={image} onUpdate={onUpdate} />);

      const altText = screen.getByRole('textbox', { name: 'Alt text' });
      fireEvent.change(altText, { target: { value: '  A blue bicycle  ' } });
      fireEvent.blur(altText);

      await waitFor(() => {
        expect(patchIngredient).toHaveBeenCalledWith('ingredient-1', {
          altText: 'A blue bicycle',
        });
      });
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(updated);
      });
    });

    it('clears the alt text with an empty value', async () => {
      patchIngredient.mockResolvedValue({ ...image, altText: '' });

      render(<IngredientTabsInfo ingredient={image} onUpdate={vi.fn()} />);

      const altText = screen.getByRole('textbox', { name: 'Alt text' });
      fireEvent.change(altText, { target: { value: '' } });
      fireEvent.blur(altText);

      await waitFor(() => {
        expect(patchIngredient).toHaveBeenCalledWith('ingredient-1', {
          altText: '',
        });
      });
    });

    it('does not save when the alt text did not change', () => {
      render(<IngredientTabsInfo ingredient={image} onUpdate={vi.fn()} />);

      fireEvent.blur(screen.getByRole('textbox', { name: 'Alt text' }));

      expect(patchIngredient).not.toHaveBeenCalled();
    });

    it('stops the field at the length Instagram accepts', () => {
      render(<IngredientTabsInfo ingredient={image} onUpdate={vi.fn()} />);

      expect(screen.getByRole('textbox', { name: 'Alt text' })).toHaveAttribute(
        'maxlength',
        '1000',
      );
    });

    it('has no alt text field for a video', () => {
      const video = {
        ...ingredient,
        category: IngredientCategory.VIDEO,
      } as IIngredient;

      render(<IngredientTabsInfo ingredient={video} onUpdate={vi.fn()} />);

      expect(
        screen.queryByRole('textbox', { name: 'Alt text' }),
      ).not.toBeInTheDocument();
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

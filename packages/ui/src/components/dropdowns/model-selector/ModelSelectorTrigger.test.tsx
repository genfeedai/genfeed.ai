import { CostTier, ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { render, screen, within } from '@testing-library/react';
import ModelSelectorTrigger from '@ui/dropdowns/model-selector/ModelSelectorTrigger';
import { describe, expect, it } from 'vitest';

function createModel(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    createdAt: '2026-01-01',
    id: overrides.key,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: overrides.key,
    label: overrides.label,
    provider: ModelProvider.REPLICATE,
    updatedAt: '2026-01-01',
    ...overrides,
  } as IModel;
}

describe('ModelSelectorTrigger', () => {
  it('shows provider icon and selected label for a single selected model', () => {
    render(
      <ModelSelectorTrigger
        selectedModels={[
          createModel({
            key: 'google/nano-banana-pro',
            label: 'Nano Banana Pro',
          }),
        ]}
        isOpen={false}
      />,
    );

    const button = screen.getByRole('button');
    expect(
      within(button).getByRole('img', { name: 'Replicate' }),
    ).toBeInTheDocument();
    expect(
      within(button).getByRole('img', { name: 'Image' }),
    ).toBeInTheDocument();
    expect(within(button).getByText('Nano Banana Pro')).toBeInTheDocument();
    expect(
      within(button).getByTestId('model-trigger-provider-icon'),
    ).toBeInTheDocument();
  });

  it('keeps a loaded auto label on one truncated line', () => {
    render(
      <ModelSelectorTrigger
        autoLabel="Auto · Lowest Cost"
        isAutoSelected
        isOpen={false}
        selectedModels={[]}
      />,
    );

    const button = screen.getByRole('button');
    const label = within(button).getByText('Auto · Lowest Cost');

    expect(button).toHaveClass('flex-nowrap', 'overflow-hidden');
    expect(label).toHaveClass('truncate', 'min-w-0');
  });

  it('exposes the credit cost for a contextual picker selection', () => {
    render(
      <ModelSelectorTrigger
        context={{ label: 'Image', value: 'image' }}
        isOpen={false}
        selectedModels={[
          createModel({ cost: 17, key: 'google/imagen-3', label: 'Imagen 3' }),
        ]}
      />,
    );

    expect(screen.getByTitle('17 credits')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Replicate' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Image' })).toBeInTheDocument();
  });

  it('drops a residual model price when contextual Auto is selected', () => {
    render(
      <ModelSelectorTrigger
        context={{ label: 'Image', value: 'image' }}
        isAutoSelected
        isOpen={false}
        selectedModels={[
          createModel({
            cost: 17,
            costTier: CostTier.HIGH,
            key: 'google/imagen-3',
            label: 'Imagen 3',
          }),
        ]}
      />,
    );

    const button = screen.getByRole('button');

    expect(within(button).getByText('Image · Auto')).toBeInTheDocument();
    expect(within(button).queryByText('Imagen 3')).not.toBeInTheDocument();
    expect(within(button).queryByTitle('17 credits')).not.toBeInTheDocument();
    expect(
      within(button).queryByRole('img', { name: 'Replicate' }),
    ).not.toBeInTheDocument();
    expect(
      within(button).queryByTestId('model-trigger-provider-icon'),
    ).not.toBeInTheDocument();
    expect(within(button).queryByText('$$$')).not.toBeInTheDocument();
  });
});

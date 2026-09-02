import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
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
});

import { ModelCategory, ModelProvider, RouterPriority } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import type {
  GenerationSetup,
  GenerationSetupSources,
} from '@genfeedai/interfaces/studio/generation-setup.interface';
import type { GenerationSetupTypeOption } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { render, screen, within } from '@testing-library/react';
import GenerationSetupTrigger from '@ui/dropdowns/generation-setup/GenerationSetupTrigger';
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

function createSetup(
  overrides: Partial<GenerationSetup> = {},
): GenerationSetup {
  return {
    sources: {},
    values: {
      aspectRatio: '1:1',
      brandingMode: 'off',
      isPromptEnhanceEnabled: false,
      modelKey: '',
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      type: 'image',
    },
    ...overrides,
  };
}

const typeOptions: GenerationSetupTypeOption[] = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
];

describe('GenerationSetupTrigger', () => {
  it('renders the type · Auto · ratio summary when fully agent-owned', () => {
    render(
      <GenerationSetupTrigger
        isOpen={false}
        models={[]}
        setup={createSetup()}
        typeOptions={typeOptions}
      />,
    );

    const button = screen.getByRole('button');
    expect(within(button).getByText('Image · Auto · 1:1')).toBeInTheDocument();
    expect(button).toHaveClass('border-primary/30', 'bg-primary/5');
  });

  it('shows the selected model label and drops the accent once a field is user-owned', () => {
    const sources: GenerationSetupSources = { modelKey: 'user' };
    render(
      <GenerationSetupTrigger
        isOpen={false}
        models={[
          createModel({
            key: 'google/nano-banana-pro',
            label: 'Nano Banana Pro',
          }),
        ]}
        setup={createSetup({
          sources,
          values: {
            aspectRatio: '16:9',
            brandingMode: 'off',
            isPromptEnhanceEnabled: false,
            modelKey: 'google/nano-banana-pro',
            outputs: 1,
            prioritize: RouterPriority.BALANCED,
            type: 'image',
          },
        })}
        typeOptions={typeOptions}
      />,
    );

    const button = screen.getByRole('button');
    expect(
      within(button).getByText('Image · Nano Banana Pro · 16:9'),
    ).toBeInTheDocument();
    expect(button).not.toHaveClass('border-primary/30');
  });
});

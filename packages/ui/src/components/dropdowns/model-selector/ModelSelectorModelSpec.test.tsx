import {
  ModelCategory,
  ModelProvider,
  QualityTier,
  SpeedTier,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import ModelSelectorModelSpec from '@ui/dropdowns/model-selector/ModelSelectorModelSpec';
import { transformModelsToOptions } from '@ui/dropdowns/model-selector/model-selector.utils';
import { describe, expect, it } from 'vitest';

function createOption(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
) {
  const model = {
    category: ModelCategory.VIDEO,
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

  return transformModelsToOptions([model], [])[0];
}

describe('ModelSelectorModelSpec', () => {
  it('carries the detail the flat row drops', () => {
    render(
      <ModelSelectorModelSpec
        option={createOption({
          aspectRatios: ['16:9', '9:16'],
          cost: 12,
          description: 'Cinematic shots with native dialogue.',
          durations: [4, 8],
          key: 'google/veo-3',
          label: 'Veo 3',
          maxOutputs: 4,
          qualityTier: QualityTier.ULTRA,
          recommendedFor: ['Ads', 'Trailers'],
          speedTier: SpeedTier.SLOW,
        })}
      />,
    );

    expect(screen.getByText('Veo 3')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(
      screen.getByText('Cinematic shots with native dialogue.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Slow')).toBeInTheDocument();
    expect(screen.getByText('Ultra')).toBeInTheDocument();
    expect(screen.getByText('12 credits')).toBeInTheDocument();
    expect(screen.getByText('4s, 8s')).toBeInTheDocument();
    expect(screen.getByText('16:9, 9:16')).toBeInTheDocument();
    expect(screen.getByText('Up to 4')).toBeInTheDocument();
    expect(screen.getByText('Ads, Trailers')).toBeInTheDocument();
  });

  it('omits rows the model has no answer for', () => {
    render(
      <ModelSelectorModelSpec
        option={createOption({ cost: 0, key: 'google/veo-3', label: 'Veo 3' })}
      />,
    );

    expect(screen.queryByText('Speed')).not.toBeInTheDocument();
    expect(screen.queryByText('Quality')).not.toBeInTheDocument();
    expect(screen.queryByText('Cost')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
    expect(screen.queryByText('Outputs')).not.toBeInTheDocument();
  });

  it('spells out the capabilities the row can only show as icons', () => {
    render(
      <ModelSelectorModelSpec
        option={createOption({
          hasEndFrame: true,
          hasInterpolation: true,
          hasResolutionOptions: true,
          hasSpeech: true,
          key: 'google/veo-3',
          label: 'Veo 3',
          maxReferences: 3,
        })}
      />,
    );

    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('End frame')).toBeInTheDocument();
    expect(screen.getByText('Interpolation')).toBeInTheDocument();
    expect(screen.getByText('3 references')).toBeInTheDocument();
    expect(screen.getByText('Resolution options')).toBeInTheDocument();
  });

  it('explains why a locked model cannot be chosen', () => {
    render(
      <ModelSelectorModelSpec
        option={createOption({ cost: 50, key: 'google/veo-3', label: 'Veo 3' })}
        lockReason="Needs 50 credits — 5 available"
      />,
    );

    expect(
      screen.getByText('Needs 50 credits — 5 available'),
    ).toBeInTheDocument();
  });
});

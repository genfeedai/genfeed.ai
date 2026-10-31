import type { IModel } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ModelDetailPanel from '@/features/models/components/models/ModelDetailPanel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

describe('ModelDetailPanel', () => {
  it('lists the model description, capabilities and key', () => {
    render(
      <ModelDetailPanel
        model={
          {
            capabilities: ['text-to-image'],
            category: 'image',
            costTier: 'high',
            description: 'Fast photoreal images',
            id: 'model-1',
            maxDimensions: { height: 1024, width: 2048 },
            key: 'google/imagen-4',
            label: 'Imagen 4',
            provider: 'replicate',
            qualityTier: 'ultra',
          } as IModel
        }
      />,
    );

    expect(screen.getByText('Fast photoreal images')).toBeInTheDocument();
    expect(screen.getByText('text-to-image')).toBeInTheDocument();
    expect(screen.getByText('Best')).toBeInTheDocument();
    expect(screen.getByText('Max: 2048 x 1024px')).toBeInTheDocument();
    expect(screen.getByText('google/imagen-4')).toBeInTheDocument();
  });
});

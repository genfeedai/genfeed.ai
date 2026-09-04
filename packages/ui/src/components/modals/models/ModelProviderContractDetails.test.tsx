import type { IModelProviderContracts } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import ModelProviderContractDetails from '@ui/modals/models/ModelProviderContractDetails';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const contracts: IModelProviderContracts = {
  endpoint: 'minimax/h3-max/text-to-video',
  pending: {
    billingUnit: 'seconds',
    conditionalDimensions: {},
    currency: 'USD',
    discoveredAt: '2026-09-01T10:00:00.000Z',
    inputSchema: {
      properties: {
        duration: { default: 5, maximum: 15, minimum: 5, type: 'integer' },
      },
      required: ['duration'],
    },
    lastSeenAt: '2026-09-01T10:00:00.000Z',
    mappingStatus: 'supported',
    outputSchema: { properties: { video: { type: 'object' } } },
    pricingType: 'per-second',
    reviewStatus: 'pending',
    schemaFamily: 'video-text-v1',
    unitPrice: '0.08',
    version: 'sha256:pending',
  },
  provider: 'fal',
  reviewed: {
    conditionalDimensions: {},
    discoveredAt: '2026-09-01T08:00:00.000Z',
    inputSchema: {
      properties: {
        prompt: { description: 'Video prompt', type: 'string' },
      },
      required: ['prompt'],
    },
    lastSeenAt: '2026-09-01T09:00:00.000Z',
    mappingStatus: 'supported',
    outputSchema: { type: 'object' },
    reviewStatus: 'approved',
    version: 'sha256:reviewed',
  },
};

describe('ModelProviderContractDetails', () => {
  it('shows reviewed and pending schema and pricing summaries', () => {
    render(
      <ModelProviderContractDetails
        contracts={contracts}
        isError={false}
        isLoading={false}
      />,
    );

    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByText('Reviewed runtime')).toBeInTheDocument();
    expect(
      screen.getByText('fal · minimax/h3-max/text-to-video'),
    ).toBeInTheDocument();
    expect(screen.getByText('duration')).toBeInTheDocument();
    expect(
      screen.getByText('integer · default 5 · min 5 · max 15'),
    ).toBeInTheDocument();
    expect(screen.getByText('0.08 · USD · seconds')).toBeInTheDocument();
    expect(screen.getByText('prompt')).toBeInTheDocument();
    expect(screen.getByText('Video prompt')).toBeInTheDocument();
    expect(screen.getAllByText('required')).toHaveLength(2);
    expect(screen.getAllByText('Discovered:')).toHaveLength(2);
    expect(screen.getAllByText('Last seen:')).toHaveLength(2);
  });
});

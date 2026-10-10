import { IngredientCategory } from '@genfeedai/contracts';
import type {
  IIngredient,
  MediaDeliveryGrant,
} from '@genfeedai/contracts/interfaces';
import type { BrandedGenerationReceiptReadV1 } from '@genfeedai/contracts/interfaces/content/branded-generation-receipt-read.interface';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationReceiptListItem from './GenerationReceiptListItem';

const preview = vi.hoisted(() => ({
  grant: null as MediaDeliveryGrant | null,
}));

vi.mock('@genfeedai/hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: () => preview.grant,
}));
vi.mock('next-intl', async () => {
  const { createTranslateFromCatalog } = await import(
    '@ui/tests/next-intl.stub'
  );
  return {
    useTranslations: createTranslateFromCatalog({
      pages: {
        generationReceipts: {
          list: {
            kind: { image: 'Image', video: 'Video', text: 'Text draft' },
            status: {
              pending: 'Pending',
              completed: 'Completed',
              needsReview: 'Needs review',
              blocked: 'Blocked',
              failed: 'Failed',
              cancelled: 'Cancelled',
            },
            model: 'Model: {model}',
            noModel: 'not recorded',
            credits: '{count, plural, one {# credit} other {# credits}}',
            cost: {
              pending: 'Cost pending',
              unavailable: 'Cost unavailable',
              none: 'No cost recorded',
            },
            openOutput: 'Open generated output',
          },
        },
      },
    }),
  };
});
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));
vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({ ariaLabel, src }: { ariaLabel: string; src: string }) => (
    <span data-testid={`video:${ariaLabel}`} data-src={src} />
  ),
}));

const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';

function mediaReceipt(
  mediaKind: 'image' | 'video',
): BrandedGenerationReceiptReadV1 {
  return {
    schemaVersion: 1,
    id: `${mediaKind}-receipt`,
    organizationId: 'org',
    brandId: 'brand',
    candidateIndex: 0,
    requestHash: hash,
    revision: 5,
    state: 'ready',
    mode: 'raw',
    surface: 'studio',
    contentType: mediaKind,
    format: mediaKind,
    platform: null,
    parentRequestId: null,
    runId: null,
    workflowExecutionId: null,
    generationId: 'ingredient-1',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: hash,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'pending' },
      enhanced: null,
      compiled: null,
    },
    execution: {
      provider: 'replicate',
      model: 'replicate/flux',
      providerAttemptRef: 'replicate:job-1',
      dispatchClaimedAt: time,
      result: 'completed',
    },
    artifact: {
      kind: 'ingredient',
      id: 'ingredient-1',
      mediaKind,
      version: 's3:v:1',
      parts: [],
      contentHash: hash,
    },
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [
      {
        id: 'generation',
        stage: 'generation',
        status: 'known',
        ledgerId: 'hold-1',
        credits: 1,
      },
    ],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 1,
    },
    isDeleted: false,
  } as BrandedGenerationReceiptReadV1;
}

function output(category: IngredientCategory, url?: string): IIngredient {
  return {
    id: 'ingredient-1',
    category,
    isDeleted: false,
    ingredientUrl: url,
  } as IIngredient;
}

function grant(state: MediaDeliveryGrant['state'], url: string | null) {
  return {
    id: 'ingredient-1',
    state,
    url,
    expiresAt: null,
  } as MediaDeliveryGrant;
}

describe('GenerationReceiptListItem', () => {
  beforeEach(() => {
    preview.grant = null;
  });

  it('shows a ready image output as a thumbnail linked to the asset, with model, cost and status', () => {
    preview.grant = grant(
      'READY',
      'https://media.genfeed.ai/signed/ingredient-1.png',
    );
    render(
      <GenerationReceiptListItem
        receipt={mediaReceipt('image')}
        href="/acme/moonrise/settings/agent/receipts?receiptId=image-receipt"
        media={output(IngredientCategory.IMAGE)}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Image · image-receipt' }),
    ).toHaveAttribute(
      'href',
      '/acme/moonrise/settings/agent/receipts?receiptId=image-receipt',
    );
    const asset = screen.getByRole('link', { name: 'Open generated output' });
    expect(asset).toHaveAttribute(
      'href',
      'https://media.genfeed.ai/signed/ingredient-1.png',
    );
    expect(asset).toHaveAttribute('target', '_blank');
    expect(within(asset).getByRole('img', { name: 'Image' })).toHaveAttribute(
      'src',
      'https://media.genfeed.ai/signed/ingredient-1.png',
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/Model: replicate\/flux/)).toHaveTextContent(
      '1 credit',
    );
  });

  it('never falls back to a retained URL while the output grant is pending', () => {
    preview.grant = grant('PENDING', null);
    render(
      <GenerationReceiptListItem
        receipt={mediaReceipt('image')}
        href="/receipts?receiptId=image-receipt"
        media={output(
          IngredientCategory.IMAGE,
          'https://cdn.genfeed.ai/raw.png',
        )}
      />,
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Open generated output' }),
    ).toBeNull();
  });

  it('previews a video output by its first frame', () => {
    render(
      <GenerationReceiptListItem
        receipt={mediaReceipt('video')}
        href="/receipts?receiptId=video-receipt"
        media={output(
          IngredientCategory.VIDEO,
          'https://cdn.genfeed.ai/clip.mp4',
        )}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Video · video-receipt' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('video:Video')).toHaveAttribute(
      'data-src',
      'https://cdn.genfeed.ai/clip.mp4#t=0.001',
    );
  });

  it('labels a failed output with no model or ledger cost honestly', () => {
    const receipt = {
      ...mediaReceipt('image'),
      state: 'failed',
      artifact: null,
      execution: null,
      costs: [
        {
          id: 'generation',
          stage: 'generation',
          status: 'unavailable',
          reasonCode: 'credit_hold_unavailable',
        },
      ],
    } as BrandedGenerationReceiptReadV1;
    render(
      <GenerationReceiptListItem
        receipt={receipt}
        href="/receipts?receiptId=image-receipt"
        media={null}
      />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/Model: not recorded/)).toHaveTextContent(
      'Cost unavailable',
    );
    expect(screen.queryByRole('img')).toBeNull();
  });
});

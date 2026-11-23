import type {
  ModelScanNewDraft,
  ModelScanPriceChange,
  ModelScanReport,
} from '@genfeedai/contracts/interfaces';
import { buildModelFixPrompt } from '@genfeedai/pricing';
import {
  adminModelsUrl,
  buildModelScanCard,
  modelScanFixPromptInput,
} from '@notifications/services/discord/model-scan-card.util';

const emptyReport: ModelScanReport = {
  dataErrors: [],
  delisted: [],
  newDrafts: [],
  priceChanges: [],
  provider: 'replicate',
  removedByProvider: [],
  startedAt: '2026-11-15T06:00:00.000Z',
  totals: {
    drifted: 0,
    draftsCreated: 0,
    errors: 0,
    newModelsFound: 0,
    polled: 0,
    quarantined: 0,
    synchronized: 0,
  },
  unreadable: [],
};

function priceChange(
  modelKey: string,
  overrides: Partial<ModelScanPriceChange> = {},
): ModelScanPriceChange {
  return {
    changes: [
      {
        component: 'image_output_count',
        newPriceUsd: 0.1,
        oldPriceUsd: 0.05,
        unit: 'output',
        variant: '2k',
      },
    ],
    isUrgent: false,
    modelKey,
    pendingRateHash: `hash-${modelKey}`,
    sourceUrl: `https://replicate.com/${modelKey}`,
    urgentReason: null,
    ...overrides,
  };
}

function draft(modelKey: string): ModelScanNewDraft {
  return {
    billingUnit: 'image',
    category: 'image',
    modelKey,
    providerCostUsd: 0.04,
    sourceUrl: `https://replicate.com/${modelKey}`,
    unpricedReason: null,
  };
}

function build(report: ModelScanReport, adminUrl: string | null = null) {
  return buildModelScanCard(report, {
    adminUrl,
    promptFor: (maxItems) =>
      buildModelFixPrompt(modelScanFixPromptInput(report, adminUrl), {
        maxItems,
      }),
  });
}

describe('buildModelScanCard', () => {
  it('returns no card when nothing needs an operator', () => {
    expect(build(emptyReport)).toBeNull();
  });

  it('lists price changes first and shows only the groups that have rows', () => {
    const card = build({
      ...emptyReport,
      newDrafts: [draft('recraft-ai/recraft-v3')],
      priceChanges: [priceChange('black-forest-labs/flux-3-image')],
      removedByProvider: [
        {
          modelKey: 'google/veo-3',
          reason: 'API returned 404',
          sourceUrl: null,
        },
      ],
    });

    expect(card?.fields?.map((field) => field.name)).toEqual([
      'Price changes',
      'Removed by provider',
      'New on the provider',
    ]);
    expect(card?.fields?.[2]?.value).toBe(
      '**recraft-ai/recraft-v3** image, $0.04 per image',
    );
    expect(card?.summary?.split('\n')[0]).toBe(
      '1 price change, 1 removed by provider, 1 new',
    );
  });

  it('does not claim an approved rate keeps charging when the run only found new drafts', () => {
    const card = build({
      ...emptyReport,
      newDrafts: [draft('recraft-ai/recraft-v3')],
    });

    expect(card?.footer).toBe(
      'New models stay inactive and unpriced until an operator reviews them. Nothing is charging.',
    );
  });

  it('claims nothing about charging when the run only found a data error', () => {
    const card = build({
      ...emptyReport,
      dataErrors: [
        {
          modelKey: 'fal-ai/runway-gen3',
          reason: 'Stored under fal, but fal no longer serves it.',
        },
      ],
    });

    expect(card?.footer).toBe(
      'The scan changes no rate. Check the row in the admin models page before acting.',
    );
  });

  it('keeps the approved-rate footer when a price changed', () => {
    const card = build({
      ...emptyReport,
      newDrafts: [draft('recraft-ai/recraft-v3')],
      priceChanges: [priceChange('black-forest-labs/flux-3-image')],
    });

    expect(card?.footer).toBe(
      'The approved rate keeps charging until an operator approves a change.',
    );
  });

  it('shows delisted models between price changes and removed ones', () => {
    const card = build({
      ...emptyReport,
      delisted: [
        {
          modelKey: 'google/veo-3',
          reason: 'model page returned 404',
          sourceUrl: null,
        },
      ],
      priceChanges: [priceChange('a/normal')],
      removedByProvider: [
        {
          modelKey: 'google/upscaler',
          reason: 'API returned 404',
          sourceUrl: null,
        },
      ],
    });

    expect(card?.fields?.map((field) => field.name)).toEqual([
      'Price changes',
      'Delisted (API still serves it)',
      'Removed by provider',
    ]);
    expect(card?.summary?.split('\n')[0]).toBe(
      '1 price change, 1 removed by provider, 1 delisted',
    );
  });

  it('puts an urgent change on top and turns the card red', () => {
    const card = build({
      ...emptyReport,
      priceChanges: [
        priceChange('a/normal'),
        priceChange('b/urgent', {
          isUrgent: true,
          urgentReason: 'provider cost $0.08 exceeds sell price $0.06',
        }),
      ],
    });

    expect(card?.color).toBe(0xef4444);
    expect(card?.fields?.[0]?.value.split('\n')[0]).toBe(
      '🔴 **b/urgent** 2k: $0.05 → $0.1 per output — provider cost $0.08 exceeds sell price $0.06',
    );
    expect(card?.summary?.split('\n')[0]).toBe('2 price changes (1 urgent)');
  });

  it('shows the top lines of a group and counts the rest', () => {
    const card = build({
      ...emptyReport,
      removedByProvider: Array.from({ length: 23 }, (_, index) => ({
        modelKey: `owner/model-${index}`,
        reason: 'API returned 404',
        sourceUrl: null,
      })),
    });

    const lines = card?.fields?.[0]?.value.split('\n') ?? [];
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe('and 19 more models');
  });

  it('carries the fix prompt in a code block and one admin button', () => {
    const card = build(
      {
        ...emptyReport,
        priceChanges: [priceChange('black-forest-labs/flux-3-image')],
      },
      'https://app.genfeed.ai/admin/automation/models',
    );

    expect(card?.action).toEqual({
      label: 'Open models in admin',
      url: 'https://app.genfeed.ai/admin/automation/models',
    });
    expect(card?.summary).toMatch(
      /```\n# Fix the models the Replicate scan flagged/,
    );
    expect(card?.summary).toContain('black-forest-labs/flux-3-image');
    expect(card?.summary?.endsWith('```')).toBe(true);
  });

  it('has no button when the app origin is unknown', () => {
    const card = build({
      ...emptyReport,
      dataErrors: [{ modelKey: 'argil/atom', reason: 'not a Replicate model' }],
    });

    expect(card?.action).toBeUndefined();
  });

  it('stays inside every Discord limit on the 65-card week', () => {
    const report: ModelScanReport = {
      ...emptyReport,
      dataErrors: [
        { modelKey: 'argil/atom', reason: 'not a Replicate model' },
        { modelKey: 'baai/bge-large-en-v1.5', reason: 'not a Replicate model' },
      ],
      delisted: Array.from({ length: 23 }, (_, index) => ({
        modelKey: `owner/delisted-model-with-a-long-name-${index}`,
        reason: 'model page returned 404',
        sourceUrl: `https://replicate.com/owner/delisted-${index}`,
      })),
      newDrafts: Array.from({ length: 34 }, (_, index) =>
        draft(`owner/new-model-with-a-long-name-${index}`),
      ),
      priceChanges: [
        priceChange('black-forest-labs/flux-3-image'),
        priceChange('black-forest-labs/flux-3-image-edit'),
      ],
      removedByProvider: Array.from({ length: 3 }, (_, index) => ({
        modelKey: `owner/removed-model-with-a-long-name-${index}`,
        reason: 'API returned 404',
        sourceUrl: `https://replicate.com/owner/removed-${index}`,
      })),
      unreadable: Array.from({ length: 4 }, (_, index) => ({
        code: 'unsupported_criterion_value:resolution',
        modelKey: `owner/unreadable-${index}`,
        reason: 'The price page has a tier this parser cannot read.',
      })),
    };

    const card = build(
      report,
      'https://app.genfeed.ai/admin/automation/models',
    );

    const fieldLengths = (card?.fields ?? []).map(
      (field) => field.name.length + field.value.length,
    );
    const total =
      (card?.title.length ?? 0) +
      (card?.summary?.length ?? 0) +
      (card?.footer?.length ?? 0) +
      fieldLengths.reduce((sum, length) => sum + length, 0);
    expect(card?.fields).toHaveLength(6);
    expect(card?.summary?.length).toBeLessThanOrEqual(4096);
    expect(total).toBeLessThanOrEqual(6000);
    expect(card?.fields?.every((field) => field.value.length <= 1024)).toBe(
      true,
    );
  });
});

describe('adminModelsUrl', () => {
  it('joins the app origin and the admin models route', () => {
    expect(adminModelsUrl('https://app.genfeed.ai')).toBe(
      'https://app.genfeed.ai/admin/automation/models',
    );
  });

  it('titles a Higgsfield scan and lists an unpriced draft', () => {
    const card = build({
      ...emptyReport,
      newDrafts: [
        {
          billingUnit: null,
          category: 'video',
          modelKey: 'higgsfield/genjutsu/restyle/v1.0',
          providerCostUsd: null,
          sourceUrl:
            'https://docs.higgsfield.ai/docs/models/genjutsu/restyle.md',
          unpricedReason: 'The price has not been sampled yet.',
        },
      ],
      provider: 'higgsfield',
    });

    expect(card?.title).toBe('Model scan: Higgsfield');
    expect(card?.fields?.map((field) => field.name)).toEqual([
      'New on the provider',
    ]);
  });

  it('is null when the app origin is not configured', () => {
    expect(adminModelsUrl(undefined)).toBeNull();
  });
});

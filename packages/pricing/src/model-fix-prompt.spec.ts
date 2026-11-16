import type {
  AdminModelPricingRow,
  ModelFixPromptItem,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  buildModelFixPrompt,
  modelFixItemsFromPricingRows,
} from './model-fix-prompt';

const items: ModelFixPromptItem[] = [
  {
    category: 'image',
    detail: 'new draft at $0.04 per image',
    key: 'recraft-ai/recraft-v3',
    problem: 'new-draft',
    provider: 'replicate',
    sourceUrl: 'https://replicate.com/recraft-ai/recraft-v3',
  },
  {
    category: 'image',
    detail: '$0.041 → $0.07 per image',
    isUrgent: true,
    key: 'black-forest-labs/flux-3',
    problem: 'price-changed',
    provider: 'replicate',
  },
  {
    category: 'music',
    detail: 'page returned 404',
    key: 'meta/musicgen',
    problem: 'removed-by-provider',
    provider: 'replicate',
  },
];

describe('buildModelFixPrompt', () => {
  it('lists urgent models first and groups the rest by problem', () => {
    const prompt = buildModelFixPrompt({
      items,
      scope: 'scan-run',
      provider: 'replicate',
    });
    expect(prompt).toContain('# Fix the models the replicate scan flagged');
    expect(prompt).toContain('3 models need action.');
    expect(prompt.indexOf('URGENT: black-forest-labs/flux-3')).toBeLessThan(
      prompt.indexOf('recraft-ai/recraft-v3'),
    );
    expect(prompt).toContain('### Removed by provider (1)');
    expect(prompt).toContain(
      '   Source: https://replicate.com/recraft-ai/recraft-v3',
    );
  });

  it('leaves the category out when the report has none', () => {
    const prompt = buildModelFixPrompt({
      items: [
        {
          category: 'unknown',
          detail: 'page returned 404',
          key: 'meta/musicgen',
          problem: 'removed-by-provider',
          provider: 'replicate',
        },
      ],
      scope: 'scan-run',
    });
    expect(prompt).toContain('1. meta/musicgen (replicate): page returned 404');
    expect(prompt).not.toContain('unknown');
  });

  it('keeps the safety rules in every prompt', () => {
    for (const scope of ['scan-run', 'attention', 'audit-all'] as const) {
      const prompt = buildModelFixPrompt({ items, scope });
      expect(prompt).toContain('never deleted');
      expect(prompt).toContain('wait for the operator to type "go"');
    }
  });

  it('truncates a compact prompt and points at the full list', () => {
    const prompt = buildModelFixPrompt(
      { items, scope: 'scan-run' },
      { maxItems: 1 },
    );
    expect(prompt).toContain('3 models need action.');
    expect(prompt).toContain('black-forest-labs/flux-3');
    expect(prompt).not.toContain('meta/musicgen');
    expect(prompt).toContain('And 2 more.');
  });

  it('says nothing needs action for an empty list', () => {
    expect(buildModelFixPrompt({ items: [], scope: 'attention' })).toBe(
      '# Fix the models that need pricing attention\n\nNothing needs action.',
    );
  });

  it('builds the audit prompt without a model list', () => {
    const prompt = buildModelFixPrompt({
      adminUrl: 'https://app.example/admin/automation/models/all',
      items: [],
      scope: 'audit-all',
    });
    expect(prompt).toContain('# Audit every model price');
    expect(prompt).toContain('genfeed admin pricing report --json');
    expect(prompt).toContain(
      'Admin models page: https://app.example/admin/automation/models/all',
    );
  });
});

describe('modelFixItemsFromPricingRows', () => {
  function row(overrides: Partial<AdminModelPricingRow>): AdminModelPricingRow {
    return {
      attention: [],
      attentionLevel: null,
      category: 'image',
      key: 'a/b',
      pending: null,
      pendingRateChanges: [],
      provider: 'replicate',
      providerSyncFailureCode: null,
      reviewed: null,
      ...overrides,
    } as AdminModelPricingRow;
  }

  it('skips models that need nothing and labels pending price changes', () => {
    const result = modelFixItemsFromPricingRows([
      row({ key: 'ok/ok' }),
      row({
        attention: [
          {
            code: 'price_change_pending',
            level: 'orange',
            reason: 'Price changed',
          },
        ],
        attentionLevel: 'orange',
        key: 'x/y',
        pendingRateChanges: [
          {
            component: 'output',
            newPriceUsd: 0.07,
            oldPriceUsd: 0.04,
            unit: 'output',
            variant: '',
          },
        ],
      }),
    ]);
    expect(result).toEqual([
      {
        category: 'image',
        detail: 'output $0.04 → $0.07 per output. Price changed',
        key: 'x/y',
        problem: 'price-changed',
        provider: 'replicate',
        sourceUrl: null,
      },
    ]);
  });

  it('labels unreadable and unpriced rows', () => {
    const result = modelFixItemsFromPricingRows([
      row({
        attention: [
          { code: 'refresh_failed', level: 'red', reason: 'Refresh failed' },
        ],
        attentionLevel: 'red',
        key: 'u/r',
        providerSyncFailureCode: 'rates_unavailable:no_tiers',
      }),
      row({
        attention: [
          { code: 'price_missing', level: 'red', reason: 'No price' },
        ],
        attentionLevel: 'red',
        key: 'u/p',
      }),
    ]);
    expect(result.map((item) => item.problem)).toEqual([
      'unreadable',
      'unpriced',
    ]);
  });
});

import { contentRunAttributes } from '@serializers/attributes/content/content-run.attributes';
import { ContentRunSerializer } from '@serializers/server/content/content-run.serializer';
import { describe, expect, it } from 'vitest';

describe('ContentRunSerializer brand remix projection', () => {
  it('emits the hydrated run fields needed to restore an editable Studio session', () => {
    const output = ContentRunSerializer.serialize({
      brand: { contextMode: 'brand', id: 'brand-1', name: 'Acme' },
      contract: 'brand-remix-run',
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: { objective: 'Create an original product reveal.' },
        output: { aspectRatio: '9:16', count: 3, kind: 'image' },
        references: [],
        reviewRequired: true,
        target: { kind: 'organic', platform: 'tiktok' },
      },
      execution: {
        actualCount: 0,
        requestedCount: 3,
        variants: [],
      },
      id: 'run-1',
      paidDraft: undefined,
      phase: 'prefilled',
      readiness: { issues: [], state: 'ready' },
      recipeVersion: 1,
      review: undefined,
      revision: 1,
      source: {
        capturedAt: '2026-08-20T09:55:00.000Z',
        evidence: [],
        metrics: { views: 12_000 },
        pattern: { hook: 'Reveal before naming the product.' },
        platform: 'tiktok',
        selector: {
          kind: 'trend_reference',
          sourceReferenceId: 'trend-ref-1',
          trendId: 'trend-1',
        },
        sourceId: 'trend-ref-1',
        title: 'Unexpected product reveal',
      },
      version: 1,
    }) as { data: { attributes: Record<string, unknown> } };

    expect(contentRunAttributes).toEqual(
      expect.arrayContaining([
        'brand',
        'contract',
        'draft',
        'execution',
        'paidDraft',
        'phase',
        'readiness',
        'recipeVersion',
        'review',
        'revision',
        'version',
      ]),
    );
    expect(output.data.attributes).toMatchObject({
      brand: { contextMode: 'brand', id: 'brand-1', name: 'Acme' },
      contract: 'brand-remix-run',
      phase: 'prefilled',
      readiness: { issues: [], state: 'ready' },
      recipeVersion: 1,
      revision: 1,
      version: 1,
    });
  });
});

import { brandRemixRunViewSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { describe, expect, it } from 'vitest';
import type { BrandRemixRunView } from '../src/models/source-remix.model';
import {
  failureReason,
  hasOpenQuote,
  quoteSummary,
  remixStage,
  variantProgress,
} from '../src/utils/source-remix-view.util';
import { remixExecution, remixQuote, remixView } from './fixtures/source-remix';

function view(overrides: Record<string, unknown> = {}): BrandRemixRunView {
  return brandRemixRunViewSchema.parse(remixView(overrides));
}

function quoteOf(run: BrandRemixRunView) {
  if (!run.generationQuote) throw new Error('Missing quote fixture');
  return run.generationQuote;
}

const NOW = Date.parse('2026-10-12T10:05:00.000Z');
const openQuote = remixQuote({
  expiresAt: '2026-10-12T10:20:00.000Z',
});

describe('remix stage', () => {
  it('starts as a draft and shows an open quote for the current revision', () => {
    expect(remixStage(view(), NOW, false)).toBe('draft');
    const quoted = view({ generationQuote: openQuote });
    expect(remixStage(quoted, NOW, false)).toBe('quoted');
    expect(remixStage(quoted, NOW, true)).toBe('draft');
  });

  it('ignores an expired, accepted or stale quote', () => {
    expect(
      hasOpenQuote(
        view({
          generationQuote: remixQuote({
            expiresAt: '2026-10-12T10:00:00.000Z',
          }),
        }),
        NOW,
      ),
    ).toBe(false);
    expect(
      hasOpenQuote(
        view({
          generationQuote: {
            ...openQuote,
            acceptedAt: '2026-10-12T10:01:00.000Z',
          },
        }),
        NOW,
      ),
    ).toBe(false);
    expect(
      hasOpenQuote(
        view({ generationQuote: { ...openQuote, revision: 1 }, revision: 2 }),
        NOW,
      ),
    ).toBe(false);
  });

  it('maps generation phases to progress, result and failure', () => {
    expect(remixStage(view({ phase: 'generating' }), NOW, false)).toBe(
      'generating',
    );
    for (const phase of ['ready_for_review', 'partially_ready', 'approved']) {
      expect(remixStage(view({ phase }), NOW, false)).toBe('done');
    }
    expect(remixStage(view({ phase: 'failed' }), NOW, false)).toBe('failed');
  });

  it('hands video and avatar remixes to Studio whatever the phase', () => {
    const video = view({
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: { objective: 'Create an original brand execution.' },
        output: { aspectRatio: '9:16', count: 1, kind: 'video' },
        references: [],
        reviewRequired: true,
        target: { kind: 'organic', platform: 'youtube' },
      },
    });
    expect(remixStage(video, NOW, false)).toBe('studio');
  });
});

describe('remix summaries', () => {
  it('summarizes variant progress and the first failure', () => {
    const run = view({
      execution: remixExecution(['ready', 'failed', 'processing']),
      phase: 'generating',
    });
    expect(variantProgress(run)).toEqual({ failed: 1, ready: 1, total: 3 });
    expect(failureReason(run)).toBe('The model rejected the request.');
    expect(failureReason(view())).toBe('The generation did not finish.');
  });

  it('states what an approval would spend, or that a key is billed', () => {
    expect(quoteSummary(quoteOf(view({ generationQuote: remixQuote() })))).toBe(
      '3 copy variations × 2 credits = 6 credits.',
    );
    expect(
      quoteSummary(
        quoteOf(
          view({
            generationQuote: remixQuote({
              billingMode: 'byok',
              count: 1,
              total: 0,
            }),
          }),
        ),
      ),
    ).toMatch(
      /1 copy variation billed to your own provider key\. Genfeed credits: 0/,
    );
  });
});

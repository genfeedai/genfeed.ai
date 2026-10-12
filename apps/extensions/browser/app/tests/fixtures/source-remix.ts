export const REMIX_BRAND = 'cbrand000000001';
export const REMIX_SOURCE = 'csource00000001';
export const REMIX_RUN = 'crun000000000001';

const textBrief = {
  constraints: [],
  fidelityMode: 'guided',
  intent: {
    objective: 'Create an original brand execution.',
    requestedText: [],
    subjects: ['Acme'],
  },
  mediaKind: 'text',
  output: {},
  provenance: [],
  references: [],
  version: 1,
};

type Json = Record<string, unknown>;

/** A strict brand-remix run view as the API projects it. */
export function remixView(overrides: Json = {}): Json {
  return {
    brand: { contextMode: 'brand', id: REMIX_BRAND, name: 'Acme' },
    brandId: REMIX_BRAND,
    concept: {
      angle: 'Show the outcome first.',
      hook: 'Outcome-led relevance hook.',
      savedAt: '2026-10-12T10:00:00.000Z',
      script: 'Create an original execution.',
      storyboard: [{ ordinal: 1, visualIntent: 'Original brand scene.' }],
    },
    contract: 'brand-remix-run',
    createdAt: '2026-10-12T10:00:00.000Z',
    draft: {
      fidelityMode: 'guided',
      identity: {},
      intent: { objective: 'Create an original brand execution.' },
      output: { count: 3, kind: 'copy' },
      references: [],
      reviewRequired: true,
      target: { kind: 'organic', platform: 'x' },
    },
    id: REMIX_RUN,
    phase: 'prefilled',
    readiness: { issues: [], state: 'ready' },
    recipeVersion: 1,
    revision: 1,
    sourceSnapshot: {
      capturedAt: '2026-10-12T10:00:00.000Z',
      evidence: ['Ship without permission'],
      metrics: {},
      pattern: { hook: 'Outcome-led relevance hook.' },
      platform: 'x',
      selector: { importedSourceId: REMIX_SOURCE, kind: 'imported_source' },
      sourceId: REMIX_SOURCE,
      title: 'Ship without permission',
    },
    status: 'pending',
    updatedAt: '2026-10-12T10:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

export function remixQuote(overrides: Json = {}): Json {
  return {
    billingMode: 'credits',
    count: 3,
    createdAt: '2026-10-12T10:00:00.000Z',
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    id: 'quote-1',
    inputHash: 'input-hash',
    model: 'background-model',
    outputKind: 'copy',
    pricingHash: 'pricing-hash',
    revision: 1,
    total: 6,
    unitCredits: 2,
    ...overrides,
  };
}

export function remixExecution(
  statuses: readonly string[],
  extra: Json = {},
): Json {
  return {
    actualCount: statuses.filter((status) => status === 'ready').length,
    generationBrief: textBrief,
    requestedCount: statuses.length,
    variants: statuses.map((status, index) => ({
      assetIds: [],
      id: `variant-${index + 1}`,
      recipeRevision: 1,
      status,
      ...(status === 'ready' ? { content: `Generated copy ${index + 1}` } : {}),
      ...(status === 'failed'
        ? { error: 'The model rejected the request.' }
        : {}),
    })),
    ...extra,
  };
}

/** The JSON:API document the content-runs routes return. */
export function remixDocument(view: Json): Json {
  const { id, ...attributes } = view;
  return { data: { attributes, id, type: 'content-runs' } };
}

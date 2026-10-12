import { InsufficientCreditsException } from '@api/exceptions/business-logic.exception';
import { BrandFactCheckService } from '@api/services/brand-validation/brand-fact-check.service';
import type { BrandFactCheckRequest } from '@api/services/brand-validation/brand-fact-check.types';
import {
  FACT_EXTRACTION_SCHEMA_NAME,
  FACT_JUDGMENT_SCHEMA_NAME,
  type FactExtraction,
  type FactJudgment,
  MAX_FACT_CHECK_TEXT_LENGTH,
} from '@api/services/brand-validation/brand-fact-check-prompt.util';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { BrandContentMemoryHit } from '@genfeedai/contracts/interfaces';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it, vi } from 'vitest';

const DRAFT = 'Orders ship in two days. Our CEO is Jane Doe.';
const actor: BrandedGenerationActorV1 = {
  actorId: 'user-a',
  brandId: 'brand-a',
  organizationId: 'org-a',
};
const zeroHash = `sha256:${'0'.repeat(64)}`;

function snapshot(
  overrides: Partial<BrandIdentitySnapshotV1> = {},
): BrandIdentitySnapshotV1 {
  return {
    approval: 'approved',
    brandId: 'brand-a',
    contentHash: zeroHash,
    diagnostics: [],
    generationRules: {
      assets: [],
      avoid: [],
      evidence: [
        { id: 'evidence-a', label: 'Synthetic source', sourceType: 'manual' },
      ],
      examples: [],
      facts: [
        {
          evidenceIds: ['evidence-a'],
          id: 'fact-shipping',
          kind: 'statement',
          match: 'literal',
          predicate: 'takes',
          required: false,
          subject: 'Shipping',
          value: 'two days',
        },
      ],
      mandatory: [],
      palette: [],
      schemaVersion: 1,
      typography: [],
    },
    identity: { name: 'Example Co' },
    organizationId: 'org-a',
    resolvedAt: '2026-10-01T00:00:00Z',
    revisionId: 'revision-a',
    revisionVersion: 1,
    schemaVersion: 1,
    voice: { audience: [], avoid: [], messagingPillars: [], values: [] },
    ...overrides,
  };
}

const request = (
  overrides: Partial<BrandFactCheckRequest> = {},
): BrandFactCheckRequest => ({
  origin: 'text',
  snapshot: snapshot(),
  text: DRAFT,
  ...overrides,
});

const passage: BrandContentMemoryHit = {
  citation: {
    kind: KnowledgeSourceKind.TEXT,
    purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
    sourceId: 'source-a',
    title: 'About us',
    version: 3,
    versionId: 'version-a3',
  },
  content: 'Example Co was founded by John Smith, who is still the CEO.',
  relevance: 0.9,
};

interface Rig {
  extraction: FactExtraction | Error;
  judgment: FactJudgment | Error | ((evidenceIds: string[]) => FactJudgment);
  hits: BrandContentMemoryHit[] | Error;
}
function build(rig: Partial<Rig> = {}) {
  const state: Rig = {
    extraction: {
      claims: [
        { claim: 'Orders ship in two days', quote: 'Orders ship in two days' },
        { claim: 'The CEO is Jane Doe', quote: 'Our CEO is Jane Doe' },
      ],
    },
    hits: [passage],
    judgment: { verdicts: [] },
    ...rig,
  };
  const evidenceSeen: string[][] = [];
  const completeStructured = vi.fn(
    async (params: {
      messages: Array<{ content: unknown }>;
      schemaName: string;
    }) => {
      if (params.schemaName === FACT_EXTRACTION_SCHEMA_NAME) {
        if (state.extraction instanceof Error) throw state.extraction;
        return state.extraction;
      }
      expect(params.schemaName).toBe(FACT_JUDGMENT_SCHEMA_NAME);
      const body = JSON.parse(String(params.messages[1].content)) as {
        evidence: Array<{ evidenceId: string }>;
      };
      const ids = body.evidence.map((e) => e.evidenceId);
      evidenceSeen.push(ids);
      if (state.judgment instanceof Error) throw state.judgment;
      return typeof state.judgment === 'function'
        ? state.judgment(ids)
        : state.judgment;
    },
  );
  const retrieveBrandKnowledge = vi.fn(async (_params: object) => {
    if (state.hits instanceof Error) throw state.hits;
    return state.hits;
  });
  const logger = { warn: vi.fn() };
  const service = new BrandFactCheckService(
    { completeStructured } as never,
    { retrieveBrandKnowledge } as never,
    logger as never,
  );
  return { completeStructured, evidenceSeen, retrieveBrandKnowledge, service };
}

const knowledgeIdOf = (ids: string[]) =>
  ids.find((id) => id.startsWith('knowledge:')) ?? 'missing';

describe('BrandFactCheckService', () => {
  it('supports a claim with a verbatim Brand OS quote and contradicts one with a verbatim Knowledge quote', async () => {
    const { service, completeStructured } = build({
      judgment: (ids) => ({
        verdicts: [
          {
            citations: [
              {
                evidenceId: 'fact:fact-shipping',
                quote: 'shipping takes: TWO days',
              },
            ],
            claimId: 'claim-1',
            verdict: 'supported',
          },
          {
            citations: [
              {
                evidenceId: knowledgeIdOf(ids),
                quote: 'who is still the CEO',
              },
            ],
            claimId: 'claim-2',
            verdict: 'contradicted',
          },
        ],
      }),
    });
    const outcome = await service.check(actor, request());
    expect(outcome).toMatchObject({
      knowledgeVersions: [
        { sourceId: 'source-a', version: 3, versionId: 'version-a3' },
      ],
      status: 'checked',
    });
    if (outcome.status !== 'checked') throw new Error('unreachable');
    expect(outcome.claims.map((c) => [c.id, c.verdict, c.origin])).toEqual([
      ['claim-1', 'supported', 'text'],
      ['claim-2', 'contradicted', 'text'],
    ]);
    expect(outcome.claims[0].evidence).toEqual([
      {
        evidenceId: 'fact:fact-shipping',
        origin: 'brand_os',
        quote: 'shipping takes: TWO days',
        ruleId: 'fact-shipping',
      },
    ]);
    expect(outcome.claims[1].evidence[0]).toMatchObject({
      origin: 'knowledge',
      sourceId: 'source-a',
      version: 3,
      versionId: 'version-a3',
    });
    expect(completeStructured).toHaveBeenCalledTimes(2);
  });

  it('downgrades a verdict whose citation is invented, misquoted or missing to unverified', async () => {
    const { service } = build({
      judgment: {
        verdicts: [
          {
            citations: [
              { evidenceId: 'fact:does-not-exist', quote: 'two days' },
            ],
            claimId: 'claim-1',
            verdict: 'supported',
          },
          {
            citations: [
              {
                evidenceId: 'fact:fact-shipping',
                quote: 'ships overnight, free',
              },
            ],
            claimId: 'claim-2',
            verdict: 'contradicted',
          },
        ],
      },
    });
    const outcome = await service.check(actor, request());
    expect(outcome).toMatchObject({ status: 'checked' });
    if (outcome.status !== 'checked') throw new Error('unreachable');
    expect(outcome.claims.map((c) => [c.verdict, c.evidence.length])).toEqual([
      ['unverified', 0],
      ['unverified', 0],
    ]);
  });

  it('leaves a claim the judge skipped, or called unverified, unverified', async () => {
    const { service } = build({
      judgment: {
        verdicts: [
          { citations: [], claimId: 'claim-1', verdict: 'unverified' },
        ],
      },
    });
    const outcome = await service.check(actor, request());
    if (outcome.status !== 'checked') throw new Error('unreachable');
    expect(outcome.claims.map((c) => c.verdict)).toEqual([
      'unverified',
      'unverified',
    ]);
  });

  it('skips the judge, and its cost, when there is no approved evidence at all', async () => {
    const { service, completeStructured } = build({ hits: [] });
    const outcome = await service.check(
      actor,
      request({
        snapshot: snapshot({
          generationRules: { ...snapshot().generationRules, facts: [] },
        }),
      }),
    );
    if (outcome.status !== 'checked') throw new Error('unreachable');
    expect(outcome.claims.map((c) => c.verdict)).toEqual([
      'unverified',
      'unverified',
    ]);
    expect(completeStructured).toHaveBeenCalledTimes(1);
  });

  it('uses no Brand OS facts from a provisional snapshot', async () => {
    const { service, evidenceSeen } = build({ hits: [] });
    const outcome = await service.check(
      actor,
      request({ snapshot: snapshot({ approval: 'provisional' }) }),
    );
    expect(outcome).toMatchObject({ status: 'checked' });
    expect(evidenceSeen).toEqual([]);
  });

  it('records a no-claims text without judging or retrieving', async () => {
    const { service, completeStructured, retrieveBrandKnowledge } = build({
      extraction: { claims: [] },
    });
    expect(await service.check(actor, request())).toEqual({
      claims: [],
      knowledgeVersions: [],
      models: [],
      status: 'checked',
    });
    expect(completeStructured).toHaveBeenCalledTimes(1);
    expect(retrieveBrandKnowledge).not.toHaveBeenCalled();
  });

  it('retrieves Knowledge only as the actor, in the actor organization and brand, never as a claim says', async () => {
    const { service, retrieveBrandKnowledge } = build();
    await service.check(
      { ...actor, apiKeyId: 'key-a', isApiKey: true, scopes: ['read'] },
      request(),
    );
    expect(retrieveBrandKnowledge).toHaveBeenCalledTimes(2);
    for (const [params] of retrieveBrandKnowledge.mock.calls)
      expect(params).toMatchObject({
        apiKeyId: 'key-a',
        brandId: 'brand-a',
        isApiKey: true,
        organizationId: 'org-a',
        scopes: ['read'],
        userId: 'user-a',
      });
  });

  it('refuses a snapshot from another organization or brand before any model call', async () => {
    const { service, completeStructured, retrieveBrandKnowledge } = build();
    for (const other of [
      snapshot({ organizationId: 'org-b' }),
      snapshot({ brandId: 'brand-b' }),
    ]) {
      expect(await service.check(actor, request({ snapshot: other }))).toEqual({
        reasonCode: 'fact_check_scope_mismatch',
        status: 'unavailable',
      });
    }
    expect(completeStructured).not.toHaveBeenCalled();
    expect(retrieveBrandKnowledge).not.toHaveBeenCalled();
  });

  it('runs both model calls through the dispatcher as the organization, with the brand and actor for the cost ledger', async () => {
    const { service, completeStructured } = build();
    await service.check(actor, request());
    for (const [, organizationId, context] of completeStructured.mock
      .calls as unknown as Array<[unknown, string, object]>) {
      expect(organizationId).toBe('org-a');
      expect(context).toEqual({ brandId: 'brand-a', userId: 'user-a' });
    }
  });

  it('refuses a text too long to read whole, and a claim list too long to record', async () => {
    const { service, completeStructured } = build();
    expect(
      await service.check(
        actor,
        request({ text: 'x'.repeat(MAX_FACT_CHECK_TEXT_LENGTH + 1) }),
      ),
    ).toEqual({
      reasonCode: 'fact_check_text_too_long',
      status: 'unavailable',
    });
    expect(completeStructured).not.toHaveBeenCalled();
    const many = build({
      extraction: {
        claims: Array.from({ length: 33 }, () => ({
          claim: 'Orders ship in two days',
          quote: 'Orders ship in two days',
        })),
      },
    });
    expect(await many.service.check(actor, request())).toEqual({
      reasonCode: 'fact_check_claim_limit',
      status: 'unavailable',
    });
  });

  it('refuses a claim that does not come from the checked text', async () => {
    const { service } = build({
      extraction: {
        claims: [
          { claim: 'Free shipping worldwide', quote: 'We ship worldwide free' },
        ],
      },
    });
    expect(await service.check(actor, request())).toEqual({
      reasonCode: 'fact_check_invalid_output',
      status: 'unavailable',
    });
  });

  describe('when the check cannot run it is unavailable, never a result', () => {
    it.each([
      [
        'a provider failure',
        new Error('provider down'),
        'fact_check_unavailable',
      ],
      [
        'an exhausted budget',
        new InsufficientCreditsException(10, 0),
        'fact_check_budget_exhausted',
      ],
      [
        'a model that never matches the schema',
        new LlmStructuredOutputError('brand_fact_claim_extraction', []),
        'fact_check_invalid_output',
      ],
    ])('extraction: %s', async (_name, error, reasonCode) => {
      const { service, retrieveBrandKnowledge } = build({ extraction: error });
      expect(await service.check(actor, request())).toEqual({
        reasonCode,
        status: 'unavailable',
      });
      expect(retrieveBrandKnowledge).not.toHaveBeenCalled();
    });

    it('judging: a provider failure', async () => {
      const { service } = build({ judgment: new Error('provider down') });
      expect(await service.check(actor, request())).toEqual({
        reasonCode: 'fact_check_unavailable',
        status: 'unavailable',
      });
    });

    it('retrieval: a Knowledge failure', async () => {
      const { service } = build({ hits: new Error('db down') });
      expect(await service.check(actor, request())).toEqual({
        reasonCode: 'fact_check_evidence_unavailable',
        status: 'unavailable',
      });
    });

    it('retrieval: an exhausted embedding budget', async () => {
      const { service } = build({
        hits: new InsufficientCreditsException(10, 0),
      });
      expect(await service.check(actor, request())).toEqual({
        reasonCode: 'fact_check_budget_exhausted',
        status: 'unavailable',
      });
    });
  });
});

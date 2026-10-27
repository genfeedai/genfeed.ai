import { AgentKnowledgeCitationService } from '@api/services/agent-orchestrator/agent-knowledge-citation.service';
import type { TurnKnowledgePassages } from '@api/services/agent-orchestrator/utils/agent-knowledge-citation.util';
import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type { KnowledgeReceipt } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const context = {
  organizationId: 'org-1',
  scope: { brandId: 'brand-1' },
  userId: 'user-1',
} as never;

function receipt(
  sourceId: string,
  title = `Source ${sourceId}`,
): KnowledgeReceipt {
  return {
    excerpt: `text ${sourceId}`,
    kind: KnowledgeSourceKind.TEXT,
    purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
    relevance: 0.8,
    sourceId,
    title,
    version: 1,
    versionId: `v-${sourceId}`,
  };
}

/** A verifier whose answers change between retrieval and the end of the turn. */
function verifierFor(readable: Record<string, string | null>) {
  return {
    revalidate: async (_actor: unknown, shown: KnowledgeReceipt) => {
      const title = readable[shown.sourceId];
      return title ? { ...shown, title } : null;
    },
  };
}

const noConflicts = { findOpenForVersions: async () => [] } as never;

const passages: TurnKnowledgePassages = new Map([
  ['p1', { brandId: 'brand-1', receipt: receipt('a') }],
  ['p2', { brandId: 'brand-1', receipt: receipt('b') }],
]);

describe('AgentKnowledgeCitationService', () => {
  it('returns an answer without citation markers unchanged', async () => {
    const service = new AgentKnowledgeCitationService(
      verifierFor({}) as never,
      noConflicts,
    );
    expect(
      await service.finalize('No sources here.', passages, context),
    ).toEqual({ content: 'No sources here.' });
  });

  it('shows the current title of a source and drops one that became unreadable', async () => {
    const service = new AgentKnowledgeCitationService(
      verifierFor({ a: 'Pricing (renamed)', b: null }) as never,
      noConflicts,
    );
    const result = await service.finalize(
      'Starter is $29 [[cite:p1]]. Enterprise is custom [[cite:p2]].',
      passages,
      context,
    );
    expect(result.content).toBe('Starter is $29 [1]. Enterprise is custom.');
    expect(result.knowledgeCitations).toEqual({
      citations: [
        {
          marker: 1,
          receipt: expect.objectContaining({ title: 'Pricing (renamed)' }),
        },
      ],
      unsupportedCount: 1,
    });
  });

  it('never turns a made-up id into a source', async () => {
    const service = new AgentKnowledgeCitationService(
      verifierFor({ a: 'Pricing' }) as never,
      noConflicts,
    );
    const result = await service.finalize(
      'Claim [[cite:p7]].',
      passages,
      context,
    );
    expect(result.content).toBe('Claim.');
    expect(result.knowledgeCitations).toEqual({
      citations: [],
      unsupportedCount: 1,
    });
  });

  it('shows no sources when the answer cites more than the resolver allows', async () => {
    const service = new AgentKnowledgeCitationService(
      verifierFor({ a: 'Pricing' }) as never,
      noConflicts,
    );
    const answer = Array.from(
      { length: 129 },
      (_, i) => `[[cite:p${i + 1}]]`,
    ).join(' ');
    const result = await service.finalize(answer, passages, context);
    expect(result.content).not.toContain('[[cite:');
    expect(result.knowledgeCitations?.citations).toEqual([]);
    expect(result.knowledgeCitations?.unsupportedCount).toBe(129);
  });

  it('shows no sources when the turn never searched Knowledge', async () => {
    const service = new AgentKnowledgeCitationService(
      verifierFor({ a: 'Pricing' }) as never,
      noConflicts,
    );
    const result = await service.finalize(
      'Claim [[cite:p1]].',
      undefined,
      context,
    );
    expect(result.knowledgeCitations?.citations).toEqual([]);
  });
  describe('conflicts', () => {
    const side = (sourceId: string, title: string) => ({
      excerpt: `$${sourceId === 'a' ? 29 : 49}`,
      sourceId,
      title,
      version: 1,
      versionId: `v-${sourceId}`,
    });
    const conflictRow = {
      a: side('a', 'Pricing'),
      b: side('c', 'Price list'),
      id: 'conflict-1',
      summary: 'The sources give different prices.',
    };
    const lookupOf = (rows: unknown[]) =>
      ({ findOpenForVersions: async () => rows }) as never;

    it('shows both sides of a conflict that involves a cited source', async () => {
      const service = new AgentKnowledgeCitationService(
        verifierFor({ a: 'Pricing', c: 'Price list' }) as never,
        lookupOf([conflictRow]),
      );
      const result = await service.finalize(
        'Starter is $29 [[cite:p1]].',
        passages,
        context,
      );
      expect(result.knowledgeCitations?.conflicts).toEqual([
        {
          id: 'conflict-1',
          sources: [
            expect.objectContaining({ marker: 1, sourceId: 'a' }),
            expect.objectContaining({ sourceId: 'c', title: 'Price list' }),
          ],
          summary: 'The sources give different prices.',
        },
      ]);
      expect(
        result.knowledgeCitations?.conflicts?.[0]?.sources[1],
      ).not.toHaveProperty('marker');
    });

    it('keeps a conflict out of the answer when the user cannot read the other side', async () => {
      const service = new AgentKnowledgeCitationService(
        verifierFor({ a: 'Pricing', c: null }) as never,
        lookupOf([conflictRow]),
      );
      const result = await service.finalize(
        'Starter is $29 [[cite:p1]].',
        passages,
        context,
      );
      expect(result.knowledgeCitations?.citations).toHaveLength(1);
      expect(result.knowledgeCitations).not.toHaveProperty('conflicts');
    });

    it('still answers with its sources when the conflict lookup fails', async () => {
      const service = new AgentKnowledgeCitationService(
        verifierFor({ a: 'Pricing' }) as never,
        {
          findOpenForVersions: async () => {
            throw new Error('database unavailable');
          },
        } as never,
      );
      const result = await service.finalize(
        'Starter is $29 [[cite:p1]].',
        passages,
        context,
      );
      expect(result.content).toBe('Starter is $29 [1].');
      expect(result.knowledgeCitations).not.toHaveProperty('conflicts');
    });
  });
});

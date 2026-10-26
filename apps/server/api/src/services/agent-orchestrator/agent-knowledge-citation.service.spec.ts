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

const passages: TurnKnowledgePassages = new Map([
  ['p1', { brandId: 'brand-1', receipt: receipt('a') }],
  ['p2', { brandId: 'brand-1', receipt: receipt('b') }],
]);

describe('AgentKnowledgeCitationService', () => {
  it('returns an answer without citation markers unchanged', async () => {
    const service = new AgentKnowledgeCitationService(verifierFor({}) as never);
    expect(
      await service.finalize('No sources here.', passages, context),
    ).toEqual({ content: 'No sources here.' });
  });

  it('shows the current title of a source and drops one that became unreadable', async () => {
    const service = new AgentKnowledgeCitationService(
      verifierFor({ a: 'Pricing (renamed)', b: null }) as never,
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
    );
    const result = await service.finalize(
      'Claim [[cite:p1]].',
      undefined,
      context,
    );
    expect(result.knowledgeCitations?.citations).toEqual([]);
  });
});

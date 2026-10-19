import { agentStrategyOpportunityAttributes } from '@serializers/attributes/automation/agent-strategy-opportunity.attributes';
import { AgentStrategyOpportunitySerializer } from '@serializers/server/automation/agent-strategy-opportunity.serializer';
import { describe, expect, it } from 'vitest';

describe('AgentStrategyOpportunitySerializer', () => {
  it('emits the opportunity facts and scalar ids without legacy aliases or the raw data column', () => {
    const output = AgentStrategyOpportunitySerializer.serialize({
      brand: 'legacy-brand',
      brandId: 'brand-1',
      data: { internal: true },
      decisionReason: 'Trend matched.',
      expectedTrafficScore: 89,
      id: 'opportunity-1',
      organization: 'legacy-organization',
      organizationId: 'organization-1',
      platformCandidates: ['twitter'],
      priorityScore: 72,
      sourceType: 'trend',
      status: 'queued',
      strategy: 'legacy-strategy',
      strategyId: 'strategy-1',
      topic: 'AI launch hooks',
    }) as {
      data: {
        attributes: Record<string, unknown>;
        id: string;
        relationships?: Record<string, unknown>;
        type: string;
      };
    };

    expect(agentStrategyOpportunityAttributes).toEqual(
      expect.arrayContaining(['priorityScore', 'status', 'strategyId']),
    );
    expect(output.data.id).toBe('opportunity-1');
    expect(output.data.type).toBe('agent-strategy-opportunity');
    expect(output.data.attributes).toMatchObject({
      brandId: 'brand-1',
      decisionReason: 'Trend matched.',
      expectedTrafficScore: 89,
      organizationId: 'organization-1',
      platformCandidates: ['twitter'],
      priorityScore: 72,
      sourceType: 'trend',
      status: 'queued',
      strategyId: 'strategy-1',
      topic: 'AI launch hooks',
    });
    for (const hidden of ['brand', 'data', 'organization', 'strategy']) {
      expect(output.data.attributes).not.toHaveProperty(hidden);
    }
    expect(output.data.relationships).toBeUndefined();
  });
});

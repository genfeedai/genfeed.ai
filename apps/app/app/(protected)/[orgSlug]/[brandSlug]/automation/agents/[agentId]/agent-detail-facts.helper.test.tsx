import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildAgentDetailFacts } from './agent-detail-facts.helper';

const LABELS = {
  autonomy: 'Autonomy',
  brand: 'Brand',
  creditsToday: 'Credits today',
  lastRun: 'Last run',
  nextRun: 'Next run',
  type: 'Type',
};

function buildStrategy(overrides: Partial<AgentStrategy> = {}): AgentStrategy {
  return {
    agentType: 'general',
    creditsUsedToday: 3,
    dailyCreditBudget: 20,
    id: 'strategy-1',
    isActive: true,
    label: 'Content agent',
    organizationId: 'org-1',
    ...overrides,
  } as AgentStrategy;
}

describe('buildAgentDetailFacts', () => {
  it('includes the caller-provided type and autonomy labels', () => {
    const facts = buildAgentDetailFacts(
      buildStrategy(),
      'General',
      'Supervised',
      LABELS,
    );
    const byId = new Map(facts.map((fact) => [fact.id, fact.value]));

    expect(byId.get('type')).toBe('General');
    expect(byId.get('autonomy')).toBe('Supervised');
    expect(byId.get('creditsToday')).toBe('3 / 20');
  });

  it('reads the brand label once known', () => {
    const facts = buildAgentDetailFacts(
      buildStrategy({ brand: { id: 'brand-1', label: 'Acme', slug: 'acme' } }),
      'General',
      'Supervised',
      LABELS,
    );
    const byId = new Map(facts.map((fact) => [fact.id, fact.value]));

    expect(byId.get('brand')).toBe('Acme');
  });

  it('renders a formatted next-run date once scheduled', () => {
    const facts = buildAgentDetailFacts(
      buildStrategy({ nextRunAt: new Date().toISOString() }),
      'General',
      'Supervised',
      LABELS,
    );
    const nextRun = facts.find((fact) => fact.id === 'nextRun')?.value;
    render(nextRun);

    expect(screen.getByText(/ago|in/)).toBeInTheDocument();
  });
});

import type { AgentChatRegistryRow } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { pickModelForTier } from '@api/services/agent-orchestrator/utils/agent-auto-model-tier.util';
import {
  AgentChatRoutingTier,
  ModelLifecycle,
  ModelProvider,
  RouterPriority,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

function candidate(
  overrides: Partial<AgentChatRegistryRow> & Pick<AgentChatRegistryRow, 'key'>,
): AgentChatRegistryRow {
  return {
    cost: 4,
    isActive: true,
    isDefault: false,
    isDiscovered: false,
    isFree: false,
    isReasoning: false,
    label: overrides.key,
    lifecycle: ModelLifecycle.RECOMMENDED,
    pricing: null,
    provider: ModelProvider.OPENROUTER,
    reviewStatus: null,
    succeededBy: null,
    ...overrides,
  };
}

/** Cheap → dear, with one reasoning row that is not the priciest. */
const CANDIDATES: AgentChatRegistryRow[] = [
  candidate({ cost: 1, key: 'cheap' }),
  candidate({ cost: 5, key: 'mid' }),
  candidate({ cost: 8, isReasoning: true, key: 'reasoner' }),
  candidate({ cost: 12, key: 'flagship' }),
];

describe('pickModelForTier', () => {
  it('maps the tiers onto the cost-sorted candidate set', () => {
    expect(pickModelForTier(CANDIDATES, AgentChatRoutingTier.SIMPLE)).toBe(
      'cheap',
    );
    expect(pickModelForTier(CANDIDATES, AgentChatRoutingTier.STANDARD)).toBe(
      'mid',
    );
  });

  it('prefers a reasoning row for complex over a pricier non-reasoning row', () => {
    expect(pickModelForTier(CANDIDATES, AgentChatRoutingTier.COMPLEX)).toBe(
      'reasoner',
    );
  });

  it('falls back to the priciest row for complex when nothing advertises reasoning', () => {
    const withoutReasoning = CANDIDATES.map((row) => ({
      ...row,
      isReasoning: false,
    }));

    expect(
      pickModelForTier(withoutReasoning, AgentChatRoutingTier.COMPLEX),
    ).toBe('flagship');
  });

  it('shifts one step down for cost and speed, one step up for quality', () => {
    expect(
      pickModelForTier(
        CANDIDATES,
        AgentChatRoutingTier.STANDARD,
        RouterPriority.COST,
      ),
    ).toBe('cheap');
    expect(
      pickModelForTier(
        CANDIDATES,
        AgentChatRoutingTier.STANDARD,
        RouterPriority.SPEED,
      ),
    ).toBe('cheap');
    expect(
      pickModelForTier(
        CANDIDATES,
        AgentChatRoutingTier.STANDARD,
        RouterPriority.QUALITY,
      ),
    ).toBe('reasoner');
    expect(
      pickModelForTier(
        CANDIDATES,
        AgentChatRoutingTier.STANDARD,
        RouterPriority.BALANCED,
      ),
    ).toBe('mid');
  });

  it('clamps the priority shift at both ends of the pool', () => {
    expect(
      pickModelForTier(
        CANDIDATES,
        AgentChatRoutingTier.SIMPLE,
        RouterPriority.COST,
      ),
    ).toBe('cheap');
    expect(
      pickModelForTier(
        CANDIDATES.map((row) => ({ ...row, isReasoning: false })),
        AgentChatRoutingTier.COMPLEX,
        RouterPriority.QUALITY,
      ),
    ).toBe('flagship');
  });

  it('breaks equal costs by label so the pick is stable run to run', () => {
    const tied = [
      candidate({ cost: 3, key: 'b/model', label: 'Beta' }),
      candidate({ cost: 3, key: 'a/model', label: 'Alpha' }),
    ];

    expect(pickModelForTier(tied, AgentChatRoutingTier.SIMPLE)).toBe('a/model');
  });

  it('returns undefined when the registry has no auto candidates', () => {
    expect(pickModelForTier([], AgentChatRoutingTier.STANDARD)).toBeUndefined();
  });
});

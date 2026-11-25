import { AGENT_CREDIT_COSTS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import {
  ORCHESTRATOR_BILLED_AGENT_TOOLS,
  SELF_BILLED_AGENT_TOOLS,
} from '@api/services/agent-orchestrator/constants/agent-tool-billing-mode.constant';
import { describe, expect, it } from 'vitest';

describe('agent tool billing mode', () => {
  const pricedTools = Object.entries(AGENT_CREDIT_COSTS)
    .filter(([, cost]) => cost > 0)
    .map(([name]) => name)
    .sort();
  const classified = [
    ...ORCHESTRATOR_BILLED_AGENT_TOOLS,
    ...SELF_BILLED_AGENT_TOOLS,
  ].sort();

  it('classifies every priced agent tool exactly once and nothing else', () => {
    expect(classified).toEqual(pricedTools);
  });
});

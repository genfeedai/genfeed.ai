import {
  buildSignupPrefillWorkflowDefinition,
  SIGNUP_PREFILL_ACTION_IDS,
} from '@api/services/signup-prefill/signup-prefill-workflow-definition';
import { describe, expect, it } from 'vitest';

describe('signup prefill workflow definition', () => {
  it('uses atomic enrichment actions and routes every mutable step failure', () => {
    const definition = buildSignupPrefillWorkflowDefinition();
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      SIGNUP_PREFILL_ACTION_IDS.PREPARE,
      SIGNUP_PREFILL_ACTION_IDS.SCRAPE,
      SIGNUP_PREFILL_ACTION_IDS.ANALYZE,
      SIGNUP_PREFILL_ACTION_IDS.DEFAULTS,
      SIGNUP_PREFILL_ACTION_IDS.PROMPT,
      SIGNUP_PREFILL_ACTION_IDS.HARNESS,
      SIGNUP_PREFILL_ACTION_IDS.FINALIZE,
      SIGNUP_PREFILL_ACTION_IDS.FAIL,
    ]);
    const failureEdges = definition.definition.edges.filter(
      (edge) => edge.sourceHandle === 'failure',
    );
    expect(failureEdges).toHaveLength(6);
    expect(failureEdges.every((edge) => edge.target === 'mark-failed')).toBe(
      true,
    );
  });
});

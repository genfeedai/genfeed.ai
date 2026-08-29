import {
  buildLifecycleEmailWorkflowDefinition,
  LIFECYCLE_EMAIL_ACTION_IDS,
} from '@api/services/lifecycle-emails/lifecycle-email-workflow.service';
import { describe, expect, it } from 'vitest';

describe('lifecycle email workflow definition', () => {
  it('models load, eligibility, render, delivery, and finalization explicitly', () => {
    const definition = buildLifecycleEmailWorkflowDefinition();
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      LIFECYCLE_EMAIL_ACTION_IDS.LOAD,
      LIFECYCLE_EMAIL_ACTION_IDS.CHECK,
      LIFECYCLE_EMAIL_ACTION_IDS.RENDER,
      LIFECYCLE_EMAIL_ACTION_IDS.DELIVER,
      LIFECYCLE_EMAIL_ACTION_IDS.FINALIZE,
    ]);
    const failures = definition.definition.edges.filter(
      (edge) => edge.sourceHandle === 'failure',
    );
    expect(failures).toHaveLength(3);
    expect(failures.every((edge) => edge.target === 'finalize-delivery')).toBe(
      true,
    );
  });
});

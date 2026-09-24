import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
} from '@genfeedai/contracts/interfaces';
import {
  buildWorkflowOutcomeInput,
  suppressWorkflowOutcomeNotification,
} from './workflow-execution-outcome.util';

const hidden = {
  sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  systemWorkflow: buildHiddenSystemWorkflowMetadata({
    canonicalId: 'agent.turn.execute',
  }),
};
const metadata = {
  source: 'proactive',
  canonicalId: 'agent.turn.execute',
  strategyId: 'strategy',
  agentReport: {
    summary: 'Two drafts ready',
    strategyId: 'strategy',
    label: 'Daily',
    sourcePath: '/acme/main/automation/agents/strategy',
  },
};
describe('workflow outcome classification', () => {
  it('shows proactive success but suppresses interactive hidden success', () => {
    expect(
      suppressWorkflowOutcomeNotification(hidden, false, { metadata }),
    ).toBe(false);
    expect(
      suppressWorkflowOutcomeNotification(hidden, false, {
        metadata: { ...metadata, source: 'interactive' },
      }),
    ).toBe(true);
    expect(suppressWorkflowOutcomeNotification(hidden, true)).toBe(false);
  });
  it('keeps internal lifecycle email outcomes suppressed', () => {
    const email = {
      sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
      systemWorkflow: buildHiddenSystemWorkflowMetadata({
        canonicalId: 'lifecycle-email.delivery',
      }),
    };
    expect(suppressWorkflowOutcomeNotification(email, true, { metadata })).toBe(
      true,
    );
  });
  it('routes the trusted report to the execution actor and does not trust interactive report metadata', () => {
    const execution = {
      organizationId: 'org',
      userId: 'actor',
      workflowId: 'workflow',
      startedAt: null,
      estimatedDurationMs: null,
      trigger: 'scheduled',
      workflow: { label: 'Internal', metadata: hidden, userId: 'system' },
    };
    expect(
      buildWorkflowOutcomeInput(execution, 'run', new Date(), null, undefined, {
        metadata,
      }),
    ).toMatchObject({
      isAgentRun: true,
      summary: 'Two drafts ready',
      strategyId: 'strategy',
      workflowLabel: 'Daily',
      workflowOwnerUserId: 'actor',
    });
    expect(
      buildWorkflowOutcomeInput(execution, 'run', new Date(), null, undefined, {
        metadata: { ...metadata, source: 'interactive' },
      }),
    ).not.toHaveProperty('summary');
  });
});

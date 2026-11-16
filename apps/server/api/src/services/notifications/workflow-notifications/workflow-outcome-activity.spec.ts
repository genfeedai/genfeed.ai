import { RetiredModelException } from '@api/helpers/exceptions/retired-model/retired-model.exception';
import { buildWorkflowOutcomeActivity } from '@api/services/notifications/workflow-notifications/workflow-outcome-activity';
import { ActivityKey } from '@genfeedai/contracts';

describe('buildWorkflowOutcomeActivity for a run stopped by a retired model', () => {
  const error = new RetiredModelException('vendor/old', 'Old Flux').message;
  const base = {
    error,
    executionId: 'exec-1',
    occurredAt: new Date('2026-11-15T22:00:00.000Z'),
    organizationId: 'org-1',
    status: 'failed' as const,
    workflowId: 'wf-1',
    workflowLabel: 'Weekly batch',
    workflowOwnerUserId: 'user-1',
  };

  it('raises a bell and email alert to the owner that names the model', () => {
    const activity = buildWorkflowOutcomeActivity(base);

    expect(activity.key).toBe(ActivityKey.WORKFLOW_EXECUTION_FAILED);
    expect(activity.userId).toBe('user-1');
    expect(activity.alert?.channels).toEqual(['in_app', 'email']);
    expect(activity.alert?.payload).toMatchObject({
      failure: {
        summary:
          'The model Old Flux was retired, so this run stopped before it started. Nothing was billed.',
        title: 'Model retired',
      },
      workflowLabel: 'Weekly batch',
    });
  });

  it('classifies a stopped agent run as a retired model with the next step', () => {
    const activity = buildWorkflowOutcomeActivity({
      ...base,
      isAgentRun: true,
    });

    expect(activity.key).toBe(ActivityKey.AGENT_RUN_FAILED);
    expect(activity.alert?.payload).toMatchObject({
      failure: {
        recovery:
          'Pick a new model for this agent, workflow or default, then run it again.',
        title: 'Model retired',
      },
    });
  });
});

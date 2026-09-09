import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export interface LifecycleMaintenanceRequest {
  organizationId: string;
  referenceDate: string;
}
export const LIFECYCLE_MAINTENANCE_IDS = {
  SWEEP: 'lifecycle-email.sweep',
  ORGANIZATION: 'lifecycle-email.organization',
  DISCOVER: 'lifecycle-email.sweep.discover',
  RECOVER: 'lifecycle-email.organization.recover',
  RECAP: 'lifecycle-email.organization.recap',
  CREDITS: 'lifecycle-email.organization.credits',
} as const;

export function lifecycleMaintenanceWorkflows(): SystemWorkflowGraphDefinition[] {
  return [
    {
      canonicalId: LIFECYCLE_MAINTENANCE_IDS.SWEEP,
      definition: {
        inputVariables: [
          {
            key: 'request',
            label: 'Scheduled period',
            required: true,
            type: 'json',
          },
        ],
        nodes: [
          createGenfeedActionNode({
            actionId: LIFECYCLE_MAINTENANCE_IDS.DISCOVER,
            id: 'discover',
            inputVariableKeys: ['request'],
          }),
        ],
        edges: [],
      },
      label: 'System Email Eligibility Sweep',
      description:
        'Discovers active organizations for durable lifecycle recovery and product emails.',
      resultNodeId: 'discover',
      version: 1,
    },
    {
      canonicalId: LIFECYCLE_MAINTENANCE_IDS.ORGANIZATION,
      definition: {
        inputVariables: [
          {
            key: 'request',
            label: 'Organization period',
            required: true,
            type: 'json',
          },
        ],
        nodes: [
          createGenfeedActionNode({
            actionId: LIFECYCLE_MAINTENANCE_IDS.RECOVER,
            id: 'recover',
            inputVariableKeys: ['request'],
          }),
          createGenfeedActionNode({
            actionId: LIFECYCLE_MAINTENANCE_IDS.RECAP,
            id: 'recap',
          }),
          createGenfeedActionNode({
            actionId: LIFECYCLE_MAINTENANCE_IDS.CREDITS,
            id: 'credits',
          }),
        ],
        edges: [
          {
            id: 'recover-recap',
            source: 'recover',
            target: 'recap',
            targetHandle: 'request',
          },
          {
            id: 'recap-credits',
            source: 'recap',
            target: 'credits',
            targetHandle: 'request',
          },
        ],
      },
      label: 'Organization System Emails',
      description:
        'Recovers due onboarding workflows, prepares eligible recaps and connection reminders, and evaluates spendable credits.',
      resultNodeId: 'credits',
      version: 1,
    },
  ];
}

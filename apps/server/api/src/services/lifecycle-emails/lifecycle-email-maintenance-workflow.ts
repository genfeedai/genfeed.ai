import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { EMAIL_SIGNAL_ACTIONS } from '@api/services/email-product-signals/email-product-signals.workflow';
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
        'Finds the organizations with due lifecycle deliveries, recaps, credit or trial notices, or new product signals, and queues one run for each.',
      resultNodeId: 'discover',
      version: 2,
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
          createGenfeedActionNode({
            actionId: EMAIL_SIGNAL_ACTIONS.GENERATIONS,
            id: 'generations',
          }),
          createGenfeedActionNode({
            actionId: EMAIL_SIGNAL_ACTIONS.RECEIPTS,
            id: 'receipts',
          }),
          createGenfeedActionNode({
            actionId: EMAIL_SIGNAL_ACTIONS.CONVERSIONS,
            id: 'conversions',
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
        'Recovers due onboarding workflows, prepares eligible recaps and connection reminders, evaluates spendable credits, queues long-generation updates and purchase receipts, and attributes confirmed product actions.',
      resultNodeId: 'credits',
      version: 2,
    },
  ];
}

import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const EMAIL_SIGNAL_ACTIONS = {
  DISPATCH: 'email-product-signals.dispatch',
  GENERATIONS: 'email-product-signals.generations',
  CONVERSIONS: 'email-product-signals.conversions',
  RECEIPTS: 'email-product-signals.receipts',
} as const;
export const EMAIL_SIGNAL_WORKFLOWS = {
  SWEEP: 'email-product-signals.reconcile',
  ORGANIZATION: 'email-product-signals.organization',
} as const;

export function buildEmailSignalWorkflows(): SystemWorkflowGraphDefinition[] {
  return [
    {
      canonicalId: EMAIL_SIGNAL_WORKFLOWS.SWEEP,
      label: 'Email product signal discovery',
      description:
        'Dispatches scoped generation and confirmed product outcome reconciliation.',
      version: 1,
      resultNodeId: 'dispatch',
      definition: {
        nodes: [
          createGenfeedActionNode({
            id: 'dispatch',
            actionId: EMAIL_SIGNAL_ACTIONS.DISPATCH,
          }),
        ],
        edges: [],
        inputVariables: [],
      },
    },
    {
      canonicalId: EMAIL_SIGNAL_WORKFLOWS.ORGANIZATION,
      label: 'Email product signal reconciliation',
      description:
        'Queues generation results and receipts, and attributes confirmed product actions.',
      version: 1,
      resultNodeId: 'conversions',
      definition: {
        nodes: [
          createGenfeedActionNode({
            id: 'generations',
            actionId: EMAIL_SIGNAL_ACTIONS.GENERATIONS,
          }),
          createGenfeedActionNode({
            id: 'receipts',
            actionId: EMAIL_SIGNAL_ACTIONS.RECEIPTS,
          }),
          createGenfeedActionNode({
            id: 'conversions',
            actionId: EMAIL_SIGNAL_ACTIONS.CONVERSIONS,
          }),
        ],
        edges: [],
        inputVariables: [],
      },
    },
  ];
}

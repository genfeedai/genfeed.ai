import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';
import type {
  LifecycleEmailSequence,
  LifecycleEmailStep,
} from '@genfeedai/interfaces';

export type LifecycleSchedulingRequest =
  | { operation: 'checkout-completed'; checkoutSessionId: string }
  | {
      operation: 'checkout-started';
      checkoutSessionId: string;
      checkoutUrl?: string;
      organizationId?: string;
      source?: string;
      userId: string;
    }
  | {
      operation: 'managed-checkout-started';
      checkoutSessionId: string;
      checkoutUrl?: string;
      email: string;
    }
  | { operation: 'signup'; userId: string }
  | {
      operation: 'subscription-lapsed';
      organizationId: string;
      subscriptionId: string;
      userId: string;
    };

export type LifecycleDeliveryScheduleItem = {
  checkoutSessionId?: string;
  email: string;
  metadata?: Record<string, string>;
  organizationId: string;
  scheduledFor: string;
  sequence: LifecycleEmailSequence;
  step: LifecycleEmailStep;
  triggerKey: string;
  userId: string;
};

export type LifecycleCheckoutCancellationItem = {
  organizationId: string;
  triggerKey: string;
  userId: string;
};

export const LIFECYCLE_SCHEDULING_WORKFLOW_IDS = {
  CANCEL_CHECKOUT: 'lifecycle-email.cancel-checkout',
  ENQUEUE_DELIVERY: 'lifecycle-email.enqueue-delivery',
  SCHEDULE: 'lifecycle-email.scheduling',
  SCHEDULE_DELIVERY: 'lifecycle-email.schedule-delivery',
} as const;

export const LIFECYCLE_SCHEDULING_ACTION_IDS = {
  CANCEL_CHECKOUT: 'lifecycle-email.scheduling.cancel-checkout',
  ENQUEUE_DELIVERY: 'lifecycle-email.scheduling.enqueue-delivery',
  FINALIZE: 'lifecycle-email.scheduling.finalize',
  PERSIST_DELIVERY: 'lifecycle-email.scheduling.persist-delivery',
  PLAN: 'lifecycle-email.scheduling.plan',
} as const;

function actionNode(
  actionId: string,
  id: string,
  inputVariableKeys?: string[],
) {
  return createGenfeedActionNode({ actionId, id, inputVariableKeys });
}

export function buildLifecycleSchedulingWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const plan = actionNode(
    LIFECYCLE_SCHEDULING_ACTION_IDS.PLAN,
    'plan-scheduling',
    ['request'],
  );
  const schedule = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'schedule-deliveries',
    parameters: {
      childWorkflowId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.SCHEDULE_DELIVERY,
      itemInputKey: 'request',
      maxConcurrency: 4,
      mode: 'await',
    },
  });
  const cancel = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'cancel-checkouts',
    parameters: {
      childWorkflowId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.CANCEL_CHECKOUT,
      itemInputKey: 'request',
      maxConcurrency: 1,
      mode: 'await',
    },
  });
  const finalize = actionNode(
    LIFECYCLE_SCHEDULING_ACTION_IDS.FINALIZE,
    'finalize-scheduling',
  );
  return {
    canonicalId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.SCHEDULE,
    definition: {
      edges: [
        {
          id: 'plan-schedule',
          source: plan.id,
          sourceHandle: 'deliveryItems',
          target: schedule.id,
          targetHandle: 'items',
        },
        {
          id: 'plan-cancel',
          source: plan.id,
          sourceHandle: 'cancellationItems',
          target: cancel.id,
          targetHandle: 'items',
        },
        {
          id: 'schedule-finalize',
          source: schedule.id,
          target: finalize.id,
          targetHandle: 'scheduled',
        },
        {
          id: 'cancel-finalize',
          source: cancel.id,
          target: finalize.id,
          targetHandle: 'canceled',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Lifecycle scheduling request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [plan, schedule, cancel, finalize],
    },
    description:
      'Plans lifecycle email deliveries or checkout cancellation and executes each atomic child workflow.',
    label: 'Schedule Lifecycle Emails',
    resultNodeId: finalize.id,
    version: 1,
  };
}

function singleActionWorkflow(
  canonicalId: string,
  actionId: string,
  label: string,
): SystemWorkflowGraphDefinition {
  const action = actionNode(actionId, 'execute', ['request']);
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: `${label} request`,
          required: true,
          type: 'json',
        },
      ],
      nodes: [action],
    },
    description: label,
    label,
    resultNodeId: action.id,
    version: 1,
  };
}

export function buildLifecycleScheduleDeliveryWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const persist = actionNode(
    LIFECYCLE_SCHEDULING_ACTION_IDS.PERSIST_DELIVERY,
    'persist-delivery',
    ['request'],
  );
  const enqueue = createGenfeedActionNode({
    actionId: 'workflow.for-each',
    id: 'enqueue-delivery',
    parameters: {
      childWorkflowId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.ENQUEUE_DELIVERY,
      itemInputKey: 'request',
      maxConcurrency: 1,
      mode: 'await',
    },
  });
  return {
    canonicalId: LIFECYCLE_SCHEDULING_WORKFLOW_IDS.SCHEDULE_DELIVERY,
    definition: {
      edges: [
        {
          id: 'persist-enqueue',
          source: persist.id,
          sourceHandle: 'items',
          target: enqueue.id,
          targetHandle: 'items',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Lifecycle delivery schedule item',
          required: true,
          type: 'json',
        },
      ],
      nodes: [persist, enqueue],
    },
    description:
      'Persists one idempotent lifecycle delivery and enqueues it only when newly created.',
    label: 'Schedule One Lifecycle Email',
    resultNodeId: enqueue.id,
    version: 1,
  };
}

export const LIFECYCLE_SCHEDULING_WORKFLOW_DEFINITIONS = [
  singleActionWorkflow(
    LIFECYCLE_SCHEDULING_WORKFLOW_IDS.ENQUEUE_DELIVERY,
    LIFECYCLE_SCHEDULING_ACTION_IDS.ENQUEUE_DELIVERY,
    'Enqueue One Lifecycle Email',
  ),
  singleActionWorkflow(
    LIFECYCLE_SCHEDULING_WORKFLOW_IDS.CANCEL_CHECKOUT,
    LIFECYCLE_SCHEDULING_ACTION_IDS.CANCEL_CHECKOUT,
    'Cancel One Checkout Recovery',
  ),
  buildLifecycleScheduleDeliveryWorkflowDefinition(),
  buildLifecycleSchedulingWorkflowDefinition(),
] satisfies SystemWorkflowGraphDefinition[];

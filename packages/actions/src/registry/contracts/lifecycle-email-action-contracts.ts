import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  closedObjectSchema,
  enumSchema,
  INTEGER_SCHEMA,
  JSON_DOCUMENT_SCHEMA,
  nullableSchema,
  STRING_MAP_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders.js';

const TRUE_FALSE = { type: 'boolean' } as const;
const SEQUENCE = enumSchema([
  'abandoned-checkout',
  'activation-nudge',
  'welcome',
  'win-back',
] as const);
const STEP = enumSchema([
  'activation-nudge',
  'checkout-recovery',
  'welcome-day-0',
  'welcome-day-2',
  'welcome-day-7',
  'win-back',
] as const);
const DELIVERY_REQUEST = closedObjectSchema(
  {
    checkoutSessionId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    sequence: SEQUENCE,
    step: STEP,
    subscriptionId: STRING_SCHEMA,
    triggerKey: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['sequence', 'step', 'triggerKey', 'userId'],
);
const DELIVERY_RECORD = closedObjectSchema(
  {
    email: STRING_SCHEMA,
    id: STRING_SCHEMA,
    metadata: JSON_DOCUMENT_SCHEMA,
    scheduledFor: STRING_SCHEMA,
    sequence: STRING_SCHEMA,
    status: STRING_SCHEMA,
    step: STRING_SCHEMA,
    triggerKey: STRING_SCHEMA,
    user: closedObjectSchema(
      {
        email: nullableSchema(STRING_SCHEMA),
        firstName: nullableSchema(STRING_SCHEMA),
        id: STRING_SCHEMA,
        isDeleted: TRUE_FALSE,
      },
      ['email', 'firstName', 'id', 'isDeleted'],
    ),
  },
  [
    'email',
    'id',
    'metadata',
    'scheduledFor',
    'sequence',
    'status',
    'step',
    'triggerKey',
    'user',
  ],
);
const TEMPLATE = closedObjectSchema(
  {
    actionLabel: STRING_SCHEMA,
    actionUrl: STRING_SCHEMA,
    paragraphs: arraySchema(STRING_SCHEMA),
    preheader: STRING_SCHEMA,
    subject: STRING_SCHEMA,
    title: STRING_SCHEMA,
  },
  ['actionLabel', 'actionUrl', 'paragraphs', 'preheader', 'subject', 'title'],
);
const DELIVERY_STATE = closedObjectSchema(
  {
    delivery: DELIVERY_RECORD,
    html: STRING_SCHEMA,
    preference: closedObjectSchema(
      {
        id: STRING_SCHEMA,
        marketingUnsubscribedAt: nullableSchema(STRING_SCHEMA),
        unsubscribeToken: STRING_SCHEMA,
      },
      ['id', 'marketingUnsubscribedAt', 'unsubscribeToken'],
    ),
    request: DELIVERY_REQUEST,
    skipReason: STRING_SCHEMA,
    template: TEMPLATE,
  },
  ['request'],
);
const stateInput = closedObjectSchema({ state: DELIVERY_STATE }, ['state']);
const SCHEDULE_ITEM = closedObjectSchema(
  {
    checkoutSessionId: STRING_SCHEMA,
    email: STRING_SCHEMA,
    metadata: STRING_MAP_SCHEMA,
    organizationId: STRING_SCHEMA,
    scheduledFor: STRING_SCHEMA,
    sequence: SEQUENCE,
    step: STEP,
    triggerKey: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  [
    'email',
    'organizationId',
    'scheduledFor',
    'sequence',
    'step',
    'triggerKey',
    'userId',
  ],
);
const CANCELLATION_ITEM = closedObjectSchema(
  {
    organizationId: STRING_SCHEMA,
    triggerKey: STRING_SCHEMA,
    userId: STRING_SCHEMA,
  },
  ['organizationId', 'triggerKey', 'userId'],
);
const SCHEDULING_REQUEST = {
  oneOf: [
    closedObjectSchema(
      {
        checkoutSessionId: STRING_SCHEMA,
        operation: enumSchema(['checkout-completed'] as const),
      },
      ['checkoutSessionId', 'operation'],
    ),
    closedObjectSchema(
      {
        checkoutSessionId: STRING_SCHEMA,
        checkoutUrl: STRING_SCHEMA,
        operation: enumSchema(['checkout-started'] as const),
        organizationId: STRING_SCHEMA,
        source: STRING_SCHEMA,
        userId: STRING_SCHEMA,
      },
      ['checkoutSessionId', 'operation', 'userId'],
    ),
    closedObjectSchema(
      {
        checkoutSessionId: STRING_SCHEMA,
        checkoutUrl: STRING_SCHEMA,
        email: STRING_SCHEMA,
        operation: enumSchema(['managed-checkout-started'] as const),
      },
      ['checkoutSessionId', 'email', 'operation'],
    ),
    closedObjectSchema(
      { operation: enumSchema(['signup'] as const), userId: STRING_SCHEMA },
      ['operation', 'userId'],
    ),
    closedObjectSchema(
      {
        operation: enumSchema(['subscription-lapsed'] as const),
        organizationId: STRING_SCHEMA,
        subscriptionId: STRING_SCHEMA,
        userId: STRING_SCHEMA,
      },
      ['operation', 'organizationId', 'subscriptionId', 'userId'],
    ),
  ],
} as const;
const BATCH = closedObjectSchema(
  {
    count: INTEGER_SCHEMA,
    results: arraySchema(JSON_DOCUMENT_SCHEMA),
  },
  ['count', 'results'],
);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'lifecycle-email.check-eligibility': {
    inputSchema: stateInput,
    outputSchema: DELIVERY_STATE,
  },
  'lifecycle-email.deliver': {
    inputSchema: stateInput,
    outputSchema: DELIVERY_STATE,
  },
  'lifecycle-email.finalize': {
    inputSchema: closedObjectSchema({
      failure: closedObjectSchema({
        error: STRING_SCHEMA,
        nodeOutputs: JSON_DOCUMENT_SCHEMA,
      }),
      state: DELIVERY_STATE,
    }),
    outputSchema: closedObjectSchema(
      { delivered: TRUE_FALSE, skipped: STRING_SCHEMA },
      ['delivered'],
    ),
  },
  'lifecycle-email.load-delivery': {
    inputSchema: closedObjectSchema({ request: DELIVERY_REQUEST }, ['request']),
    outputSchema: DELIVERY_STATE,
  },
  'lifecycle-email.render': {
    inputSchema: stateInput,
    outputSchema: DELIVERY_STATE,
  },
  'lifecycle-email.scheduling.cancel-checkout': {
    inputSchema: closedObjectSchema({ request: CANCELLATION_ITEM }, [
      'request',
    ]),
    outputSchema: CANCELLATION_ITEM,
  },
  'lifecycle-email.scheduling.enqueue-delivery': {
    inputSchema: closedObjectSchema({ request: SCHEDULE_ITEM }, ['request']),
    outputSchema: SCHEDULE_ITEM,
  },
  'lifecycle-email.scheduling.finalize': {
    inputSchema: closedObjectSchema({ canceled: BATCH, scheduled: BATCH }, [
      'canceled',
      'scheduled',
    ]),
    outputSchema: closedObjectSchema(
      { canceled: INTEGER_SCHEMA, scheduled: INTEGER_SCHEMA },
      ['canceled', 'scheduled'],
    ),
  },
  'lifecycle-email.scheduling.persist-delivery': {
    inputSchema: closedObjectSchema({ request: SCHEDULE_ITEM }, ['request']),
    outputSchema: closedObjectSchema({ items: arraySchema(SCHEDULE_ITEM) }, [
      'items',
    ]),
  },
  'lifecycle-email.scheduling.plan': {
    inputSchema: closedObjectSchema({ request: SCHEDULING_REQUEST }, [
      'request',
    ]),
    outputSchema: closedObjectSchema(
      {
        cancellationItems: arraySchema(CANCELLATION_ITEM),
        deliveryItems: arraySchema(SCHEDULE_ITEM),
      },
      ['cancellationItems', 'deliveryItems'],
    ),
  },
};

export function getLifecycleEmailActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}

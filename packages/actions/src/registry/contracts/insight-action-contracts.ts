import type { ActionContractSchemas } from './action-contract.interface.js';
import {
  arraySchema,
  BOOLEAN_SCHEMA,
  closedObjectSchema,
  NUMBER_SCHEMA,
  nullableSchema,
  STRING_SCHEMA,
} from './schema-builders.js';

const REQUEST = closedObjectSchema(
  { limit: NUMBER_SCHEMA, organizationId: STRING_SCHEMA },
  ['limit', 'organizationId'],
);
const PLAN = closedObjectSchema(
  {
    existingIds: arraySchema(STRING_SCHEMA),
    missingCount: NUMBER_SCHEMA,
    organizationId: STRING_SCHEMA,
  },
  ['existingIds', 'missingCount', 'organizationId'],
);
const DRAFT = closedObjectSchema({
  actionableSteps: arraySchema(STRING_SCHEMA),
  category: STRING_SCHEMA,
  confidence: NUMBER_SCHEMA,
  description: STRING_SCHEMA,
  expiresAt: nullableSchema(STRING_SCHEMA),
  impact: STRING_SCHEMA,
  isDismissed: BOOLEAN_SCHEMA,
  isRead: BOOLEAN_SCHEMA,
  relatedMetrics: arraySchema(STRING_SCHEMA),
  title: STRING_SCHEMA,
});
const GENERATED = closedObjectSchema({ drafts: arraySchema(DRAFT) }, [
  'drafts',
]);

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'insight.generate-drafts': {
    inputSchema: closedObjectSchema({ plan: PLAN }, ['plan']),
    outputSchema: GENERATED,
  },
  'insight.load-generation-context': {
    inputSchema: closedObjectSchema({ request: REQUEST }, ['request']),
    outputSchema: PLAN,
  },
  'insight.persist-generated': {
    inputSchema: closedObjectSchema({ generated: GENERATED, plan: PLAN }, [
      'generated',
      'plan',
    ]),
    outputSchema: closedObjectSchema(
      { insightIds: arraySchema(STRING_SCHEMA), persisted: NUMBER_SCHEMA },
      ['insightIds', 'persisted'],
    ),
  },
};

export function getInsightActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}

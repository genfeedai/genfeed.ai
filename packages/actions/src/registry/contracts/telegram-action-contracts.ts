import type { ActionContractSchemas } from './action-contract.interface';
import {
  closedObjectSchema,
  enumSchema,
  JSON_DOCUMENT_SCHEMA,
  STRING_SCHEMA,
} from './schema-builders';

const TRUE_SCHEMA = { const: true, type: 'boolean' } as const;
const REQUEST = closedObjectSchema(
  {
    distributionId: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    platform: enumSchema(['telegram'] as const),
  },
  ['distributionId', 'organizationId', 'platform'],
);
const DELIVERY = closedObjectSchema(
  {
    brandId: STRING_SCHEMA,
    caption: STRING_SCHEMA,
    chatId: STRING_SCHEMA,
    contentType: enumSchema(['photo', 'text', 'video'] as const),
    credentialId: STRING_SCHEMA,
    distributionId: STRING_SCHEMA,
    mediaUrl: STRING_SCHEMA,
    organizationId: STRING_SCHEMA,
    skipped: TRUE_SCHEMA,
    text: STRING_SCHEMA,
  },
  ['chatId', 'contentType', 'distributionId', 'organizationId'],
);
const CREDENTIAL = {
  oneOf: [
    closedObjectSchema({}),
    closedObjectSchema({ ready: TRUE_SCHEMA }, ['ready']),
  ],
} as const;
const SEND_RESULT = {
  oneOf: [
    closedObjectSchema({ telegramMessageId: STRING_SCHEMA }),
    closedObjectSchema({ skipped: TRUE_SCHEMA }, ['skipped']),
  ],
} as const;

const CONTRACTS: Readonly<Record<string, ActionContractSchemas>> = {
  'telegram.distribution.claim': {
    inputSchema: closedObjectSchema({ request: REQUEST }, ['request']),
    outputSchema: DELIVERY,
  },
  'telegram.distribution.finalize': {
    inputSchema: closedObjectSchema(
      {
        delivery: DELIVERY,
        failure: JSON_DOCUMENT_SCHEMA,
        result: SEND_RESULT,
      },
      ['delivery'],
    ),
    outputSchema: closedObjectSchema({ delivered: { type: 'boolean' } }, [
      'delivered',
    ]),
  },
  'telegram.distribution.resolve-credential': {
    inputSchema: closedObjectSchema({ delivery: DELIVERY }, ['delivery']),
    outputSchema: CREDENTIAL,
  },
  'telegram.distribution.send': {
    inputSchema: closedObjectSchema(
      { credential: CREDENTIAL, delivery: DELIVERY },
      ['credential', 'delivery'],
    ),
    outputSchema: SEND_RESULT,
  },
};

export function getTelegramActionContract(
  id: string,
): ActionContractSchemas | undefined {
  return CONTRACTS[id];
}

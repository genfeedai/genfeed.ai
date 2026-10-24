import { creditTransactionAttributes } from '@serializers/attributes/billing/credit-transaction.attributes';

/** Ledger metadata keys that exist only for abuse checks, never for readers. */
const INTERNAL_LEDGER_METADATA_KEYS = new Set(['cardKey', 'emailKey', 'ipKey']);

export const creditTransactionSerializerConfig = {
  attributeTransforms: {
    metadata: (record: Record<string, unknown>) => {
      const { metadata } = record;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
        return metadata;
      return Object.fromEntries(
        Object.entries(metadata).filter(
          ([key]) => !INTERNAL_LEDGER_METADATA_KEYS.has(key),
        ),
      );
    },
  },
  attributes: creditTransactionAttributes,
  type: 'credit-transaction',
};

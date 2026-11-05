import { adminCreditLedgerEntryAttributes } from '@serializers/attributes/billing/admin-credit-ledger-entry.attributes';
import { creditTransactionSerializerConfig } from '@serializers/configs/billing/credit-transaction.config';

export const adminCreditLedgerEntrySerializerConfig = {
  attributeTransforms: creditTransactionSerializerConfig.attributeTransforms,
  attributes: adminCreditLedgerEntryAttributes,
  type: 'admin-credit-ledger-entry',
};

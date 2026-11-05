import { buildSerializer } from '@serializers/builders';
import { adminCreditLedgerEntrySerializerConfig } from '@serializers/configs';

export const { AdminCreditLedgerEntrySerializer } = buildSerializer(
  'server',
  adminCreditLedgerEntrySerializerConfig,
);

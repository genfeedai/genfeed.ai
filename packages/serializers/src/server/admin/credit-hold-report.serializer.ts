import { buildSerializer } from '@serializers/builders';
import { creditHoldReportSerializerConfig } from '@serializers/configs';
export const { CreditHoldReportSerializer } = buildSerializer(
  'server',
  creditHoldReportSerializerConfig,
);

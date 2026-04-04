import { buildSerializer } from '@serializers/builders';
import { crmTaskSerializerConfig } from '@serializers/configs';

export const { CrmTaskSerializer } = buildSerializer(
  'server',
  crmTaskSerializerConfig,
);

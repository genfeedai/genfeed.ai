import { buildSerializer } from '@serializers/builders';
import { crmGenerateContentResultSerializerConfig } from '@serializers/configs';

export const { CrmGenerateContentResultSerializer } = buildSerializer(
  'server',
  crmGenerateContentResultSerializerConfig,
);

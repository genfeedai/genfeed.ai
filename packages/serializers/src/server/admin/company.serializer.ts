import { buildSerializer } from '@serializers/builders';
import { companySerializerConfig } from '@serializers/configs';

export const { CompanySerializer } = buildSerializer(
  'server',
  companySerializerConfig,
);

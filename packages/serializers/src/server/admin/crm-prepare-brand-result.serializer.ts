import { buildSerializer } from '@serializers/builders';
import { crmPrepareBrandResultSerializerConfig } from '@serializers/configs';

export const { CrmPrepareBrandResultSerializer } = buildSerializer(
  'server',
  crmPrepareBrandResultSerializerConfig,
);

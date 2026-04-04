import { crmPrepareBrandResultAttributes } from '@serializers/attributes/admin/crm-prepare-brand-result.attributes';
import { simpleConfig } from '@serializers/builders';

export const crmPrepareBrandResultSerializerConfig = simpleConfig(
  'crm-prepare-brand-result',
  crmPrepareBrandResultAttributes,
);

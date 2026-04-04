import { companyAttributes } from '@serializers/attributes/admin/company.attributes';
import { simpleConfig } from '@serializers/builders';

export const companySerializerConfig = simpleConfig(
  'company',
  companyAttributes,
);

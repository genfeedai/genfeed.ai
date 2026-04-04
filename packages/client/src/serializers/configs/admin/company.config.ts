import { companyAttributes } from '../../attributes/admin/company.attributes';
import { simpleConfig } from '../../builders';

export const companySerializerConfig = simpleConfig(
  'company',
  companyAttributes,
);

import { serviceAttributes } from '../../attributes/integrations/service.attributes';
import { simpleConfig } from '../../builders';

export const serviceOAuthSerializerConfig = simpleConfig(
  'service-oauth',
  serviceAttributes,
);

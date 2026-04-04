import { serviceAttributes } from '@serializers/attributes/integrations/service.attributes';
import { simpleConfig } from '@serializers/builders';

export const serviceOAuthSerializerConfig = simpleConfig(
  'service-oauth',
  serviceAttributes,
);

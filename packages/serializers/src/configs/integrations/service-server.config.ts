import { serviceAttributes } from '@serializers/attributes/integrations/service.attributes';
import { simpleConfig } from '@serializers/builders';

export const serviceSerializerConfig = simpleConfig(
  'service',
  serviceAttributes,
);

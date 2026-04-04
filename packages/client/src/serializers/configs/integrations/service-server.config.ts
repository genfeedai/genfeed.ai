import { serviceAttributes } from '../../attributes/integrations/service.attributes';
import { simpleConfig } from '../../builders';

export const serviceSerializerConfig = simpleConfig(
  'service',
  serviceAttributes,
);

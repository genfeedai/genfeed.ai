import { buildSerializer, simpleConfig } from '@serializers/builders';

export const { MediaDeliveryGrantSerializer } = buildSerializer(
  'server',
  simpleConfig('media-delivery-grant', [
    'url',
    'expiresAt',
    'state',
    'purpose',
  ]),
);

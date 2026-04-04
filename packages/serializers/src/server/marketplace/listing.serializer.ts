import { buildSerializer } from '@serializers/builders';
import { listingSerializerConfig } from '@serializers/configs';

export const { ListingSerializer } = buildSerializer(
  'server',
  listingSerializerConfig,
);

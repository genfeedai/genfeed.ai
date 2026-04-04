import { buildSingleSerializer, type BuiltSerializer } from '../../builders';
import { listingSerializerConfig } from '../../configs';

export const ListingSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  listingSerializerConfig,
);

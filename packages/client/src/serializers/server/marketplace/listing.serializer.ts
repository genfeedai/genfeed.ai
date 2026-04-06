import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { listingSerializerConfig } from '../../configs';

export const ListingSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  listingSerializerConfig,
);

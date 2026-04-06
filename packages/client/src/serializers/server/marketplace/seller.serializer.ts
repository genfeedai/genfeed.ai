import { type BuiltSerializer, buildSingleSerializer } from '../../builders';
import { sellerSerializerConfig } from '../../configs';

export const SellerSerializer: BuiltSerializer = buildSingleSerializer(
  'server',
  sellerSerializerConfig,
);

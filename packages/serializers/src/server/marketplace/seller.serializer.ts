import { buildSerializer } from '@serializers/builders';
import { sellerSerializerConfig } from '@serializers/configs';

export const { SellerSerializer } = buildSerializer(
  'server',
  sellerSerializerConfig,
);

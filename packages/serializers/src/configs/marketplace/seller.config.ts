import { sellerAttributes } from '@serializers/attributes/marketplace/seller.attributes';
import { simpleConfig } from '@serializers/builders';

export const sellerSerializerConfig = simpleConfig('seller', sellerAttributes);

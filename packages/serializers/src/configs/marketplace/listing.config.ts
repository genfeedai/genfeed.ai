import { listingAttributes } from '@serializers/attributes/marketplace/listing.attributes';
import { sellerAttributes } from '@serializers/attributes/marketplace/seller.attributes';
import { rel } from '@serializers/builders';

export const listingSerializerConfig = {
  attributes: listingAttributes,
  seller: rel('seller', sellerAttributes),
  sellerData: rel('seller', sellerAttributes),
  type: 'listing',
};

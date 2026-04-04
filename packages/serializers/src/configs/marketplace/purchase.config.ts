import { listingAttributes } from '@serializers/attributes/marketplace/listing.attributes';
import { purchaseAttributes } from '@serializers/attributes/marketplace/purchase.attributes';
import { sellerAttributes } from '@serializers/attributes/marketplace/seller.attributes';
import { rel } from '@serializers/builders';

export const purchaseSerializerConfig = {
  attributes: purchaseAttributes,
  listing: rel('listing', listingAttributes),
  listingData: rel('listing', listingAttributes),
  seller: rel('seller', sellerAttributes),
  sellerData: rel('seller', sellerAttributes),
  type: 'purchase',
};

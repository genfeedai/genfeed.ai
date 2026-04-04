import { listingAttributes } from '../../attributes/marketplace/listing.attributes';
import { purchaseAttributes } from '../../attributes/marketplace/purchase.attributes';
import { sellerAttributes } from '../../attributes/marketplace/seller.attributes';
import { rel } from '../../builders';

export const purchaseSerializerConfig = {
  attributes: purchaseAttributes,
  listing: rel('listing', listingAttributes),
  listingData: rel('listing', listingAttributes),
  seller: rel('seller', sellerAttributes),
  sellerData: rel('seller', sellerAttributes),
  type: 'purchase',
};

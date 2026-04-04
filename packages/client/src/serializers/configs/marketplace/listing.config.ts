import { listingAttributes } from '../../attributes/marketplace/listing.attributes';
import { sellerAttributes } from '../../attributes/marketplace/seller.attributes';
import { rel } from '../../builders';

export const listingSerializerConfig = {
  attributes: listingAttributes,
  seller: rel('seller', sellerAttributes),
  sellerData: rel('seller', sellerAttributes),
  type: 'listing',
};

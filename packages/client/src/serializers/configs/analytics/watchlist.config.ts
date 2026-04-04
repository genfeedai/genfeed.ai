import { watchlistAttributes } from '../../attributes/analytics/watchlist.attributes';
import { BRAND_REL } from '../../relationships';

export const watchlistSerializerConfig = {
  attributes: watchlistAttributes,
  brand: BRAND_REL,
  type: 'watchlist',
};

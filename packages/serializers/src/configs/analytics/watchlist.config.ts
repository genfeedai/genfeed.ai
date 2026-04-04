import { watchlistAttributes } from '@serializers/attributes/analytics/watchlist.attributes';
import { BRAND_REL } from '@serializers/relationships';

export const watchlistSerializerConfig = {
  attributes: watchlistAttributes,
  brand: BRAND_REL,
  type: 'watchlist',
};

import { createEntityAttributes } from '@genfeedai/helpers';

export const libraryElementAttributes = createEntityAttributes([
  'user',
  'organization',
  'brand',
  'type',
  // CHARACTER or an element type: the References list merges both.
  'kind',
  'label',
  'handle',
  'description',
  // Every live reference file, cover first.
  'coverIngredientId',
  'referenceIngredientIds',
  'availabilityMode',
  'availableBrandIds',
  'owningBrandId',
  'owningBrandName',
]);

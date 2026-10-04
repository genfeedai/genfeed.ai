import { createEntityAttributes } from '@genfeedai/helpers';

export const tagAttributes = createEntityAttributes([
  'organization',
  'brand',
  'user',
  'category',
  'label',
  'description',
  'key',
  'backgroundColor',
  'textColor',
  'isActive',
  // Owner columns, so a client can tell a brand tag from an organization-wide
  // one on tags embedded in an asset (#6011).
  'brandId',
  'organizationId',
  // Derived on Library tag lists (`GET /tags/library`).
  'scope',
  'assetCount',
]);

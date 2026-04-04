import { evaluationAttributes } from '../attributes/analytics/evaluation.attributes';
import { assetAttributes } from '../attributes/ingredients/asset.attributes';
import { folderAttributes } from '../attributes/management/folder.attributes';
import { tagAttributes } from '../attributes/management/tag.attributes';
import { brandAttributes } from '../attributes/organizations/brand.attributes';
import { organizationAttributes } from '../attributes/organizations/organization.attributes';
import { userAttributes } from '../attributes/users/user.attributes';
import { rel } from '../builders';

/**
 * Common relationship definitions used across multiple serializer configs.
 * Import these to reduce duplication in config files.
 */

// Full entity relationships (with all attributes)
export const USER_REL = rel('user', userAttributes);
export const ORGANIZATION_REL = rel('organization', organizationAttributes);
export const BRAND_REL = rel('brand', brandAttributes);
export const TAG_REL = rel('tag', tagAttributes);
export const ASSET_REL = rel('asset', assetAttributes);
export const EVALUATION_REL = rel('evaluation', evaluationAttributes);
export const FOLDER_REL = rel('folder', folderAttributes);

// Minimal relationships (for list views / performance)
export const ORGANIZATION_MINIMAL_REL = rel('organization', ['label']);
export const BRAND_MINIMAL_REL = rel('brand', ['label', 'handle']);

/**
 * Standard entity relationships bundle.
 * Use spread operator: `...STANDARD_ENTITY_RELS`
 */
export const STANDARD_ENTITY_RELS = {
  brand: BRAND_REL,
  organization: ORGANIZATION_REL,
  tags: TAG_REL,
  user: USER_REL,
} as const;

/**
 * Content entity relationships (for posts, articles, ingredients).
 * Includes standard rels plus evaluation.
 */
export const CONTENT_ENTITY_RELS = {
  ...STANDARD_ENTITY_RELS,
  evaluation: EVALUATION_REL,
} as const;

/**
 * Minimal entity relationships for list views.
 * Uses abbreviated attribute sets for better performance.
 */
export const MINIMAL_ENTITY_RELS = {
  brand: BRAND_MINIMAL_REL,
  organization: ORGANIZATION_MINIMAL_REL,
  user: USER_REL,
} as const;

// Type exports for consumers
export type StandardEntityRels = typeof STANDARD_ENTITY_RELS;
export type ContentEntityRels = typeof CONTENT_ENTITY_RELS;
export type MinimalEntityRels = typeof MINIMAL_ENTITY_RELS;

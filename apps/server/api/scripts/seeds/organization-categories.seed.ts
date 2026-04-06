/**
 * Seed Script: Organization Categories
 *
 * Seeds the `organization-categories` reference collection with predefined
 * category metadata (key, label, description, icon, sortOrder).
 * Categories match the OrganizationCategory enum values.
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/organization-categories.seed.ts
 *   bun run apps/server/api/scripts/seeds/organization-categories.seed.ts --dry-run
 */

import { runScript } from '@api-scripts/db/connection';
import { parseArgs, seedDocuments } from '@api-scripts/db/seed-utils';
import { OrganizationCategory } from '@genfeedai/enums';
import type { IOrganizationCategorySeedDocument } from '@genfeedai/interfaces';
import { Logger } from '@nestjs/common';

const logger = new Logger('OrgCategoriesSeed');

const FIELDS_TO_CHECK = [
  'label',
  'description',
  'icon',
  'sortOrder',
  'isDeleted',
];

// ============================================================================
// CATEGORY DATA
// ============================================================================

const CATEGORIES: IOrganizationCategorySeedDocument[] = [
  {
    description:
      'Individual content creators, influencers, and solo artists producing original content.',
    icon: 'user',
    isDeleted: false,
    key: OrganizationCategory.CREATOR,
    label: 'Creator',
    sortOrder: 1,
  },
  {
    description:
      'Businesses and brands managing their own content production and marketing.',
    icon: 'building',
    isDeleted: false,
    key: OrganizationCategory.BUSINESS,
    label: 'Business',
    sortOrder: 2,
  },
  {
    description:
      'Marketing and creative agencies managing content for multiple clients.',
    icon: 'users',
    isDeleted: false,
    key: OrganizationCategory.AGENCY,
    label: 'Agency',
    sortOrder: 3,
  },
];

// ============================================================================
// RUN SEED
// ============================================================================

const args = parseArgs();

runScript(
  'Organization Categories Seed',
  async (db) => {
    return await seedDocuments(db, 'organization-categories', CATEGORIES, {
      dryRun: args.dryRun,
      fieldsToCheck: FIELDS_TO_CHECK,
      keyField: 'key',
    });
  },
  { database: args.database, uri: args.uri },
).catch((error) => {
  logger.error('Seed failed:', error);
  process.exit(1);
});

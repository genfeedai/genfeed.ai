/**
 * Seed Script: Marketplace Packages (Official Workflows & Prompts)
 *
 * Seeds marketplace listings from @genfeedai/workflows and @genfeedai/prompts
 * core packages. Creates an official "GenFeed AI" seller and upserts all
 * catalog items as published listings.
 *
 * Uses packageSource + packageSlug as the upsert key (idempotent).
 *
 * Usage:
 *   bun run apps/server/api/scripts/seeds/marketplace-packages.seed.ts
 *   bun run apps/server/api/scripts/seeds/marketplace-packages.seed.ts --dry-run
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runScript } from '@api-scripts/db/connection';
import { parseArgs, seedDocuments } from '@api-scripts/db/seed-utils';
import { Logger } from '@nestjs/common';
import { ObjectId } from 'mongodb';

const logger = new Logger('MarketplacePackagesSeed');

// ============================================================================
// CATALOG DATA
// ============================================================================

interface CatalogWorkflow {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  tier: string;
  icon: string;
  defaultModel: string;
  inputTypes: string[];
  outputTypes: string[];
}

interface CatalogPrompt {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  tier: string;
  icon: string;
}

const SCRIPT_DIR = __dirname;

function isValidMonorepoRoot(candidateRoot: string): boolean {
  return (
    existsSync(
      join(
        candidateRoot,
        'core',
        'packages',
        'workflows',
        'metadata',
        'catalog.json',
      ),
    ) &&
    existsSync(
      join(
        candidateRoot,
        'core',
        'packages',
        'prompts',
        'metadata',
        'catalog.json',
      ),
    )
  );
}

function resolveMonorepoRoot(): string {
  const explicitRoot = process.env.GENFEED_ROOT;
  if (explicitRoot && isValidMonorepoRoot(explicitRoot)) {
    return explicitRoot;
  }

  const searchStarts = [process.cwd(), SCRIPT_DIR];
  const searched: string[] = [];

  for (const start of searchStarts) {
    for (let depth = 0; depth <= 10; depth += 1) {
      const candidate = resolve(start, ...Array(depth).fill('..'));
      const normalized = candidate.replace(/\/+$/, '');

      if (!searched.includes(normalized)) {
        searched.push(normalized);
      }

      if (isValidMonorepoRoot(normalized)) {
        return normalized;
      }
    }
  }

  // Worktree fallback: infer monorepo root from .git pointer file.
  // Example pointer: "gitdir: /path/to/cloud/.git/worktrees/<name>"
  const gitPointerPath = join(process.cwd(), '.git');
  if (existsSync(gitPointerPath) && statSync(gitPointerPath).isFile()) {
    const pointer = readFileSync(gitPointerPath, 'utf-8').trim();
    const match = pointer.match(/^gitdir:\s*(.+)$/);
    if (match?.[1]) {
      const gitDirPath = resolve(process.cwd(), match[1]);
      const splitPattern = /[\\/]\.git[\\/]worktrees[\\/].+$/;
      const cloudRepoRoot = gitDirPath.replace(splitPattern, '');
      const monorepoRoot = resolve(cloudRepoRoot, '..');
      if (isValidMonorepoRoot(monorepoRoot)) {
        return monorepoRoot;
      }
      if (!searched.includes(monorepoRoot)) {
        searched.push(monorepoRoot);
      }
    }
  }

  throw new Error(
    `Unable to locate monorepo root containing core packages. Set GENFEED_ROOT. Searched: ${searched.join(', ')}`,
  );
}

// Load catalogs from core packages
const MONOREPO_ROOT = resolveMonorepoRoot();
const CORE_ROOT = join(MONOREPO_ROOT, 'core');
const WORKFLOWS_PKG = join(CORE_ROOT, 'packages', 'workflows');
const PROMPTS_PKG = join(CORE_ROOT, 'packages', 'prompts');

function loadWorkflowCatalog(): CatalogWorkflow[] {
  const raw = readFileSync(
    join(WORKFLOWS_PKG, 'metadata', 'catalog.json'),
    'utf-8',
  );
  return JSON.parse(raw).workflows;
}

function loadPromptCatalog(): CatalogPrompt[] {
  const raw = readFileSync(
    join(PROMPTS_PKG, 'metadata', 'catalog.json'),
    'utf-8',
  );
  return JSON.parse(raw).prompts;
}

function loadWorkflowJson(slug: string): Record<string, unknown> {
  const raw = readFileSync(
    join(WORKFLOWS_PKG, 'workflows', `${slug}.json`),
    'utf-8',
  );
  return JSON.parse(raw);
}

function loadPromptJson(slug: string): Record<string, unknown> {
  // Prompts are organized by category subdirectory
  const catalog = loadPromptCatalog();
  const entry = catalog.find((p) => p.slug === slug);
  if (!entry) {
    throw new Error(`Prompt "${slug}" not found in catalog`);
  }

  const raw = readFileSync(
    join(PROMPTS_PKG, 'prompts', entry.category, `${slug}.json`),
    'utf-8',
  );
  return JSON.parse(raw);
}

// ============================================================================
// OFFICIAL SELLER
// ============================================================================

const SELLER_COLLECTION = 'sellers';
const LISTING_COLLECTION = 'listings';

const OFFICIAL_SELLER_SLUG = 'genfeed-official';
const DRY_RUN_SELLER_ID = new ObjectId('000000000000000000000001');

// Production IDs: vincent@genfeed.ai user + Genfeed.ai org
const GENFEED_USER_ID = new ObjectId('6813b131bc7686bf101cb35b');
const GENFEED_ORG_ID = new ObjectId('687514009f59b22a757bcf04');

const officialSeller = {
  avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=genfeed-official',
  badgeTier: 'verified',
  bio: 'Official workflows and prompts from the GenFeed AI team. Production-ready templates for content creation, automation, and AI-powered media generation.',
  displayName: 'GenFeed AI',
  followerCount: 0,
  isDeleted: false,
  organization: GENFEED_ORG_ID,
  payoutEnabled: false,
  rating: 5.0,
  reviewCount: 0,
  slug: OFFICIAL_SELLER_SLUG,
  social: {
    github: 'genfeedai',
    twitter: 'genfeedai',
  },
  status: 'approved',
  stripeOnboardingComplete: false,
  totalEarnings: 0,
  totalSales: 0,
  user: GENFEED_USER_ID,
  website: 'https://genfeed.ai',
};

const SELLER_FIELDS_TO_CHECK = [
  'displayName',
  'bio',
  'avatar',
  'website',
  'social',
  'badgeTier',
  'status',
  'isDeleted',
];

// ============================================================================
// BUILD LISTINGS
// ============================================================================

function buildWorkflowPreviewData(
  workflowJson: Record<string, unknown>,
): Record<string, unknown> {
  const nodes = workflowJson.nodes as Array<Record<string, unknown>>;
  const edges = workflowJson.edges as Array<Record<string, unknown>>;
  const nodeTypes = [...new Set(nodes.map((n) => n.type as string))];

  return {
    connections: edges?.length || 0,
    nodes: nodes?.length || 0,
    nodeTypes,
    version: workflowJson.version || 1,
  };
}

function buildPromptPreviewData(
  promptJson: Record<string, unknown>,
): Record<string, unknown> {
  const variables = promptJson.variables as Array<Record<string, unknown>>;

  return {
    category: promptJson.category,
    template: promptJson.template,
    variableCount: variables?.length || 0,
    variables: variables?.map((v) => ({
      label: v.label,
      name: v.name,
      type: v.type,
    })),
  };
}

interface ListingDocument {
  slug: string;
  seller: ObjectId;
  organization: ObjectId;
  type: string;
  title: string;
  shortDescription: string;
  description: string;
  price: number;
  currency: string;
  tags: string[];
  thumbnail?: string;
  previewImages: string[];
  previewData: Record<string, unknown>;
  downloadData: Record<string, unknown>;
  views: number;
  downloads: number;
  purchases: number;
  rating: number;
  reviewCount: number;
  likeCount: number;
  revenue: number;
  version: string;
  status: string;
  publishedAt: Date;
  canBeSoldSeparately: boolean;
  isDeleted: boolean;
  packageSource: string;
  packageSlug: string;
  pricingTier: string;
  isOfficial: boolean;
  installCount: number;
}

const LISTING_FIELDS_TO_CHECK = [
  'title',
  'shortDescription',
  'description',
  'price',
  'tags',
  'previewData',
  'downloadData',
  'version',
  'pricingTier',
  'isOfficial',
  'packageSource',
  'packageSlug',
  'isDeleted',
];

function buildWorkflowListings(
  sellerId: ObjectId,
  orgId: ObjectId,
): ListingDocument[] {
  const catalog = loadWorkflowCatalog();

  return catalog.map((entry) => {
    const workflowJson = loadWorkflowJson(entry.slug);

    return {
      canBeSoldSeparately: true,
      currency: 'usd',
      description: `# ${entry.title}\n\n${entry.description}\n\n**Category:** ${entry.category}\n**Default Model:** ${entry.defaultModel}\n**Input Types:** ${entry.inputTypes.join(', ')}\n**Output Types:** ${entry.outputTypes.join(', ')}\n\nOfficial workflow template by GenFeed AI. Ready to use in your workspace.`,
      downloadData: workflowJson,
      downloads: 0,
      installCount: 0,
      isDeleted: false,
      isOfficial: true,
      likeCount: 0,
      organization: orgId,
      packageSlug: entry.slug,
      packageSource: '@genfeedai/workflows',
      previewData: buildWorkflowPreviewData(workflowJson),
      previewImages: [],
      price: 0,
      pricingTier: entry.tier,
      publishedAt: new Date(),
      purchases: 0,
      rating: 0,
      revenue: 0,
      reviewCount: 0,
      seller: sellerId,
      shortDescription: entry.description,
      slug: `${OFFICIAL_SELLER_SLUG}/${entry.slug}`,
      status: 'published',
      tags: [...entry.tags, entry.category, 'official'],
      title: entry.title,
      type: 'workflow',
      version: `${workflowJson.version || 1}.0.0`,
      views: 0,
    };
  });
}

function buildPromptListings(
  sellerId: ObjectId,
  orgId: ObjectId,
): ListingDocument[] {
  const catalog = loadPromptCatalog();

  return catalog.map((entry) => {
    const promptJson = loadPromptJson(entry.slug);

    return {
      canBeSoldSeparately: true,
      currency: 'usd',
      description: `# ${entry.title}\n\n${entry.description}\n\n**Category:** ${entry.category}\n\nOfficial prompt template by GenFeed AI. Customize variables and use in your content pipeline.`,
      downloadData: promptJson,
      downloads: 0,
      installCount: 0,
      isDeleted: false,
      isOfficial: true,
      likeCount: 0,
      organization: orgId,
      packageSlug: entry.slug,
      packageSource: '@genfeedai/prompts',
      previewData: buildPromptPreviewData(promptJson),
      previewImages: [],
      price: 0,
      pricingTier: entry.tier,
      publishedAt: new Date(),
      purchases: 0,
      rating: 0,
      revenue: 0,
      reviewCount: 0,
      seller: sellerId,
      shortDescription: entry.description,
      slug: `${OFFICIAL_SELLER_SLUG}/${entry.slug}`,
      status: 'published',
      tags: [...entry.tags, entry.category, 'official'],
      title: entry.title,
      type: 'prompt',
      version: '1.0.0',
      views: 0,
    };
  });
}

// ============================================================================
// RUN SEED
// ============================================================================

const args = parseArgs();

runScript(
  'Marketplace Packages Seed',
  async (db) => {
    // 1. Seed official seller
    logger.log('\n📦 Seeding Official Seller...\n');
    const sellerResult = await seedDocuments(
      db,
      SELLER_COLLECTION,
      [officialSeller],
      {
        dryRun: args.dryRun,
        fieldsToCheck: SELLER_FIELDS_TO_CHECK,
        keyField: 'slug',
      },
    );

    // 2. Get seller ID from database
    const sellersCollection = db.collection('sellers');
    const sellerDoc = await sellersCollection.findOne({
      slug: OFFICIAL_SELLER_SLUG,
    });

    if (!sellerDoc && !args.dryRun) {
      throw new Error('Failed to find official seller after seeding');
    }

    // In dry-run mode, no data is written, so resolve to deterministic IDs.
    const sellerId = sellerDoc?._id || DRY_RUN_SELLER_ID;
    const orgId = sellerDoc?.organization || GENFEED_ORG_ID;

    // 3. Build and seed workflow listings
    logger.log('\n📦 Seeding Workflow Listings...\n');
    const workflowListings = buildWorkflowListings(sellerId, orgId);
    const workflowResult = await seedDocuments(
      db,
      LISTING_COLLECTION,
      workflowListings,
      {
        dryRun: args.dryRun,
        fieldsToCheck: LISTING_FIELDS_TO_CHECK,
        keyField: 'slug',
      },
    );

    // 4. Build and seed prompt listings
    logger.log('\n📦 Seeding Prompt Listings...\n');
    const promptListings = buildPromptListings(sellerId, orgId);
    const promptResult = await seedDocuments(
      db,
      LISTING_COLLECTION,
      promptListings,
      {
        dryRun: args.dryRun,
        fieldsToCheck: LISTING_FIELDS_TO_CHECK,
        keyField: 'slug',
      },
    );

    return {
      prompts: promptResult,
      sellers: sellerResult,
      workflows: workflowResult,
    };
  },
  {
    database: args.database || 'marketplace',
    uri: args.uri,
  },
).catch((error) => {
  logger.error('Seed failed:', error);
  process.exit(1);
});

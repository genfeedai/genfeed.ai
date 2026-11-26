import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ListingStatus } from '@genfeedai/contracts';
import { stableStringify } from '@genfeedai/contracts/constants/canonical-json.constant';
import {
  PRESET_CATALOG,
  type PresetCatalogEntry,
} from '@genfeedai/contracts/constants/preset-catalog.constant';
import {
  type AdminMarketplaceListing,
  createMarketplaceListing,
  createMarketplaceSellerProfile,
  hasMarketplaceSellerProfile,
  type MarketplaceListingCreate,
  readMarketplaceListingsBySource,
  reviewMarketplaceListing,
  submitMarketplaceListing,
  updateMarketplaceListing,
} from '@/operations/admin-marketplace';
import { GenfeedError } from '@/utils/errors';

/** The public presets repository, the source of every preset listing. */
export const PRESET_LISTING_SOURCE = 'genfeedai/presets';
/** The public skills repository, the source of every free skill listing. */
export const SKILL_LISTING_SOURCE = 'genfeedai/skills';
export const OFFICIAL_SELLER_NAME = 'Genfeed Official';

const SHORT_DESCRIPTION_MAX = 300;
/** The store API reads a request body of up to 100 kB; stay under it with room for the other fields. */
const LISTING_BODY_MAX_BYTES = 95_000;
const SKILL_FILE_NAME = 'SKILL.md';
/** Files in a skill folder that are generated or listing metadata, not skill content. */
const SKILL_FILES_LEFT_OUT = new Set(['README.md', 'metadata.json']);
const PRESET_KIND_LABELS = {
  ad: 'ad',
  b2b: 'B2B playbook',
  cinematic: 'cinematic short',
  studio: 'studio',
} as const;

export type SyncSelection = 'all' | 'presets' | 'skills';

/** What a source item must look like in the store. */
export type ListingDraft = MarketplaceListingCreate;

export type SyncAction = 'create' | 'finish-review' | 'unchanged' | 'update' | 'rejected';

export interface SyncPlanEntry {
  action: SyncAction;
  draft: ListingDraft;
  existing?: AdminMarketplaceListing;
}

export interface SyncPlan {
  entries: SyncPlanEntry[];
  /** Listings of a synced source whose item no longer exists. They are never removed. */
  orphans: AdminMarketplaceListing[];
}

export interface SkippedSkill {
  reason: string;
  slug: string;
}

export interface SyncResult {
  created: number;
  failed: string[];
  published: number;
  unchanged: number;
  updated: number;
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function plain(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/** Sorted-key JSON of what the store would hold, so a document read back from Postgres compares equal. */
function sameDocument(left: unknown, right: unknown): boolean {
  return (
    stableStringify(JSON.parse(JSON.stringify(left ?? null))) ===
    stableStringify(JSON.parse(JSON.stringify(right ?? null)))
  );
}

export function buildPresetListing(preset: PresetCatalogEntry): ListingDraft {
  const kind = PRESET_KIND_LABELS[preset.kind];
  return {
    description: `${preset.description}\n\nA built-in Genfeed ${kind} preset for ${preset.type} generation. It is free and already part of the Genfeed app; this listing is the same definition from the open-source catalogue.`,
    downloadData: {
      category: preset.type === 'video' ? 'video-generation' : 'image-generation',
      config: plain({
        description: preset.description,
        key: preset.key,
        label: preset.label,
        prompt: preset.prompt,
        ...preset.values,
      }),
      template: preset.prompt || preset.description,
    },
    packageSlug: preset.key,
    packageSource: PRESET_LISTING_SOURCE,
    previewData: { kind: preset.kind, mediaType: preset.type },
    price: 0,
    shortDescription: truncate(preset.description, SHORT_DESCRIPTION_MAX),
    tags: ['preset', preset.kind, preset.type],
    title: preset.label,
    type: 'preset',
    version: '1.0.0',
  };
}

export function buildPresetListings(
  catalog: readonly PresetCatalogEntry[] = PRESET_CATALOG
): ListingDraft[] {
  return catalog.map(buildPresetListing);
}

interface SkillMetadata {
  description?: unknown;
  name?: unknown;
  tags?: unknown;
  triggers?: unknown;
  version?: unknown;
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

async function readDirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

async function readSkillFiles(skillDir: string): Promise<Array<{ content: string; path: string }>> {
  const files: Array<{ content: string; path: string }> = [];
  const walk = async (relative: string): Promise<void> => {
    const entries = await readdir(path.join(skillDir, relative), { withFileTypes: true });
    for (const entry of entries.sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const entryPath = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && !(relative === '' && SKILL_FILES_LEFT_OUT.has(entry.name))) {
        const content = await readFile(path.join(skillDir, entryPath), 'utf8');
        files.push({ content, path: entryPath });
      }
    }
  };
  await walk('');
  return files;
}

async function buildSkillListing(
  skillDir: string,
  moduleName: string,
  slug: string
): Promise<ListingDraft> {
  const metadata = JSON.parse(
    await readFile(path.join(skillDir, 'metadata.json'), 'utf8')
  ) as SkillMetadata;
  const description = typeof metadata.description === 'string' ? metadata.description : '';
  if (!description) throw new Error('metadata.json has no description');
  if (metadata.name !== slug) throw new Error('metadata.json name does not match the folder');
  const files = await readSkillFiles(skillDir);
  if (!files.some((file) => file.path === SKILL_FILE_NAME)) {
    throw new Error(`${SKILL_FILE_NAME} is missing`);
  }
  const draft: ListingDraft = {
    description: `${description}\n\nA free Genfeed skill from the open-source skills repository (module: ${moduleName}). It works in any agent that reads Agent Skills.`,
    downloadData: { description, files, slug },
    packageSlug: slug,
    packageSource: SKILL_LISTING_SOURCE,
    previewData: {
      fileCount: files.length,
      module: moduleName,
      triggers: readStrings(metadata.triggers),
    },
    price: 0,
    shortDescription: truncate(description, SHORT_DESCRIPTION_MAX),
    tags: ['skill', moduleName, ...readStrings(metadata.tags)],
    title: slug,
    type: 'skill',
    version: typeof metadata.version === 'string' ? metadata.version : '1.0.0',
  };
  if (Buffer.byteLength(JSON.stringify(draft)) > LISTING_BODY_MAX_BYTES) {
    throw new Error(`the listing is larger than ${LISTING_BODY_MAX_BYTES} bytes`);
  }
  return draft;
}

/**
 * Reads a checkout of the skills repository: `<module>/<skill>/SKILL.md` with
 * a `metadata.json` beside it. A skill that cannot be read is skipped and
 * reported, so one broken folder does not hold back the rest.
 */
export async function readSkillListings(
  skillsDir: string
): Promise<{ drafts: ListingDraft[]; skipped: SkippedSkill[] }> {
  const drafts: ListingDraft[] = [];
  const skipped: SkippedSkill[] = [];
  const seen = new Set<string>();

  for (const moduleName of await readDirectories(skillsDir)) {
    const moduleDir = path.join(skillsDir, moduleName);
    for (const slug of await readDirectories(moduleDir)) {
      const skillDir = path.join(moduleDir, slug);
      const hasSkillFile = (await readdir(skillDir)).includes(SKILL_FILE_NAME);
      if (!hasSkillFile) continue;
      try {
        if (seen.has(slug)) throw new Error('another module already has a skill with this name');
        drafts.push(await buildSkillListing(skillDir, moduleName, slug));
        seen.add(slug);
      } catch (error) {
        skipped.push({
          reason: error instanceof Error ? error.message : String(error),
          slug: `${moduleName}/${slug}`,
        });
      }
    }
  }

  if (drafts.length === 0 && skipped.length === 0) {
    throw new GenfeedError(
      `No skills found in ${skillsDir}`,
      'Pass a checkout of genfeedai/skills: folders of <module>/<skill>/SKILL.md'
    );
  }
  return { drafts, skipped };
}

function isSameContent(draft: ListingDraft, existing: AdminMarketplaceListing): boolean {
  return (
    existing.title === draft.title &&
    existing.shortDescription === draft.shortDescription &&
    existing.description === draft.description &&
    existing.price === draft.price &&
    existing.version === draft.version &&
    sameDocument(existing.tags ?? [], draft.tags) &&
    sameDocument(existing.previewData ?? {}, draft.previewData) &&
    sameDocument(existing.downloadData ?? {}, draft.downloadData)
  );
}

/** Compare what the sources hold with what the store holds. Pure; nothing is written. */
export function planSync(
  drafts: readonly ListingDraft[],
  existing: readonly AdminMarketplaceListing[]
): SyncPlan {
  const keyOf = (source: string | null | undefined, slug: string | null | undefined): string =>
    `${source ?? ''}\u0000${slug ?? ''}`;
  const byKey = new Map(
    existing.map((listing) => [keyOf(listing.packageSource, listing.packageSlug), listing])
  );
  const draftKeys = new Set(drafts.map((draft) => keyOf(draft.packageSource, draft.packageSlug)));

  const entries = drafts.map((draft): SyncPlanEntry => {
    const listing = byKey.get(keyOf(draft.packageSource, draft.packageSlug));
    if (!listing) return { action: 'create', draft };
    if (listing.status === ListingStatus.REJECTED)
      return { action: 'rejected', draft, existing: listing };
    if (!isSameContent(draft, listing)) return { action: 'update', draft, existing: listing };
    if (listing.status === ListingStatus.DRAFT || listing.status === ListingStatus.PENDING_REVIEW) {
      return { action: 'finish-review', draft, existing: listing };
    }
    return { action: 'unchanged', draft, existing: listing };
  });

  const orphans = existing.filter(
    (listing) => !draftKeys.has(keyOf(listing.packageSource, listing.packageSlug))
  );
  return { entries, orphans };
}

export async function readSyncPlan(
  marketplaceApiUrl: string,
  drafts: readonly ListingDraft[]
): Promise<SyncPlan> {
  const sources = [...new Set(drafts.map((draft) => draft.packageSource))];
  const existing = (
    await Promise.all(
      sources.map((source) => readMarketplaceListingsBySource(marketplaceApiUrl, source))
    )
  ).flat();
  return planSync(drafts, existing);
}

/** Take a listing to published: submit a draft, then approve what waits for review. */
async function publish(
  marketplaceApiUrl: string,
  listing: Pick<AdminMarketplaceListing, 'id' | 'status'>
): Promise<void> {
  if (listing.status === ListingStatus.DRAFT) {
    await submitMarketplaceListing(marketplaceApiUrl, listing.id);
  }
  await reviewMarketplaceListing(marketplaceApiUrl, listing.id, { isApproved: true });
}

/**
 * Writes the plan to the store: creates what is missing, updates what changed,
 * finishes review for a listing a former run left half-way, and never deletes.
 * One failing item is recorded and the run goes on, so a second run finishes it.
 */
export async function applySyncPlan(
  marketplaceApiUrl: string,
  plan: SyncPlan
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, failed: [], published: 0, unchanged: 0, updated: 0 };

  if (!(await hasMarketplaceSellerProfile(marketplaceApiUrl))) {
    await createMarketplaceSellerProfile(marketplaceApiUrl, OFFICIAL_SELLER_NAME);
  }

  for (const entry of plan.entries) {
    const label = `${entry.draft.packageSource}/${entry.draft.packageSlug}`;
    try {
      if (entry.action === 'unchanged' || entry.action === 'rejected') {
        result.unchanged += 1;
      } else if (entry.action === 'create') {
        const created = await createMarketplaceListing(marketplaceApiUrl, entry.draft);
        result.created += 1;
        await publish(marketplaceApiUrl, created);
        result.published += 1;
      } else if (entry.existing) {
        if (entry.action === 'update') {
          const {
            packageSlug: _slug,
            packageSource: _source,
            type: _type,
            ...fields
          } = entry.draft;
          await updateMarketplaceListing(marketplaceApiUrl, entry.existing.id, fields);
          result.updated += 1;
        }
        if (
          entry.existing.status === ListingStatus.DRAFT ||
          entry.existing.status === ListingStatus.PENDING_REVIEW
        ) {
          await publish(marketplaceApiUrl, entry.existing);
          result.published += 1;
        }
      }
    } catch (error) {
      result.failed.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

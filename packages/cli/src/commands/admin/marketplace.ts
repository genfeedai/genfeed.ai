import { ListingStatus } from '@genfeedai/contracts';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  type AdminMarketplaceListing,
  MARKETPLACE_LISTING_STATUSES,
  parseMarketplaceListingStatus,
  readMarketplaceListing,
  readMarketplaceListings,
  resolveMarketplaceApiUrl,
  reviewMarketplaceListing,
} from '@/operations/admin-marketplace';
import {
  applySyncPlan,
  buildPresetListings,
  type ListingDraft,
  readSkillListings,
  readSyncPlan,
  type SkippedSkill,
  type SyncSelection,
} from '@/operations/admin-marketplace-sync';
import {
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { GenfeedError, handleError } from '@/utils/errors';
import { wantsJson } from '@/utils/options';

interface MarketplaceGlobalOptions extends Record<string, unknown> {
  marketplaceUrl?: string;
}

interface ListingsOptions {
  status: ListingStatus;
}

interface SyncOptions {
  only: SyncSelection;
  skillsDir?: string;
  yes?: boolean;
}

function parseSyncSelection(value: string): SyncSelection {
  if (value === 'all' || value === 'presets' || value === 'skills') return value;
  throw new GenfeedError(`Unknown selection "${value}"`, 'Use one of: all, presets, skills');
}

/** What a draft sets on the store's picture and video fields, for the plan. */
function describeMedia(draft: ListingDraft): Record<string, unknown> {
  return {
    previewImages: draft.previewImages ?? [],
    previewVideo: draft.previewVideo ?? null,
    thumbnail: draft.thumbnail ?? null,
  };
}

function formatMediaLine(draft: ListingDraft): string {
  const label = `${draft.packageSource}/${draft.packageSlug}`;
  if (!draft.thumbnail && !draft.previewVideo && !draft.previewImages?.length)
    return `no example, media left empty  ${label}`;
  const parts = [
    draft.thumbnail ? `thumbnail ${draft.thumbnail}` : undefined,
    draft.previewVideo ? `video ${draft.previewVideo}` : undefined,
    draft.previewImages?.length ? `${draft.previewImages.length} images` : undefined,
  ].filter(Boolean);
  return `${parts.join(', ')}  ${label}`;
}

async function runSync(options: SyncOptions, command: Command): Promise<void> {
  const marketplaceApiUrl = await readMarketplaceApiUrl(command);
  const drafts: ListingDraft[] = [];
  let skipped: SkippedSkill[] = [];

  if (options.only !== 'skills') drafts.push(...buildPresetListings());
  if (options.only !== 'presets') {
    if (!options.skillsDir) {
      throw new GenfeedError(
        'Skills need a checkout of genfeedai/skills',
        'Pass --skills-dir <path>, or --only presets'
      );
    }
    const skills = await readSkillListings(options.skillsDir);
    drafts.push(...skills.drafts);
    skipped = skills.skipped;
  }

  const plan = await readSyncPlan(marketplaceApiUrl, drafts);
  const counts = { create: 0, 'finish-review': 0, rejected: 0, unchanged: 0, update: 0 };
  for (const entry of plan.entries) counts[entry.action] += 1;

  if (wantsJson(command) && !options.yes) {
    printJson({
      counts,
      items: plan.entries.map((entry) => ({
        action: entry.action,
        media: describeMedia(entry.draft),
        price: entry.draft.price,
        slug: entry.draft.packageSlug,
        source: entry.draft.packageSource,
        title: entry.draft.title,
        type: entry.draft.type,
      })),
      orphans: plan.orphans.map((listing) => listing.packageSlug),
      skipped,
    });
    return;
  }

  print(formatHeader(`Store sync (${options.yes ? 'applying' : 'preview'})\n`));
  for (const entry of plan.entries) {
    if (entry.action === 'unchanged') continue;
    print(
      `${entry.action.padEnd(13)} ${entry.draft.type.padEnd(7)} ${String(entry.draft.price ? entry.draft.price / 100 : 'free').padStart(5)}  ${entry.draft.packageSource}/${entry.draft.packageSlug}`
    );
  }
  const withMedia = plan.entries.filter(
    (entry) =>
      entry.draft.thumbnail || entry.draft.previewVideo || entry.draft.previewImages?.length
  );
  print(
    formatLabel(
      'Media',
      `${withMedia.length} of ${plan.entries.length} items set a picture or a clip`
    )
  );
  for (const entry of plan.entries) {
    if (entry.draft.type === 'preset') print(`  ${formatMediaLine(entry.draft)}`);
  }
  print(
    formatLabel(
      'Plan',
      `${counts.create} to create, ${counts.update} to update, ${counts['finish-review']} to publish, ${counts.unchanged} unchanged, ${counts.rejected} rejected earlier (left alone)`
    )
  );
  for (const item of skipped) print(formatWarning(`Skipped skill ${item.slug}: ${item.reason}`));
  for (const listing of plan.orphans) {
    print(
      formatWarning(
        `${listing.packageSource}/${listing.packageSlug} is no longer in its source; left in the store`
      )
    );
  }

  if (!options.yes) {
    print(formatWarning('Re-run with --yes to write this to the store.'));
    return;
  }

  const result = await applySyncPlan(marketplaceApiUrl, plan);
  if (wantsJson(command)) {
    printJson(result);
  } else {
    print(
      formatSuccess(
        `Created ${result.created}, updated ${result.updated}, published ${result.published}, unchanged ${result.unchanged}`
      )
    );
    for (const failure of result.failed) print(formatWarning(`Failed: ${failure}`));
  }
  if (result.failed.length > 0) process.exitCode = 1;
}

interface ReviewOptions {
  note?: string;
  reason?: string;
  yes?: boolean;
}

function readMarketplaceApiUrl(command: Command): Promise<string> {
  return resolveMarketplaceApiUrl(
    command.optsWithGlobals<MarketplaceGlobalOptions>().marketplaceUrl
  );
}

export function formatListingPrice(listing: AdminMarketplaceListing): string {
  if (!listing.price) return 'free';
  return `${(listing.price / 100).toFixed(2)} ${(listing.currency ?? 'usd').toUpperCase()}`;
}

function printListing(listing: AdminMarketplaceListing): void {
  print(formatLabel('Listing', listing.id));
  print(formatLabel('Title', listing.title));
  print(formatLabel('Type', listing.type));
  print(formatLabel('Price', formatListingPrice(listing)));
  print(formatLabel('Status', listing.status));
}

async function runReview(
  listingId: string,
  isApproved: boolean,
  options: ReviewOptions,
  command: Command
): Promise<void> {
  const marketplaceApiUrl = await readMarketplaceApiUrl(command);
  const reason = isApproved ? options.note : options.reason;

  if (!options.yes) {
    const listing = await readMarketplaceListing(marketplaceApiUrl, listingId);
    print(formatHeader(`${isApproved ? 'Approve' : 'Reject'} listing (preview)\n`));
    printListing(listing);
    if (reason) print(formatLabel(isApproved ? 'Note' : 'Reason', reason));
    print(
      formatWarning(
        isApproved
          ? 'Re-run with --yes to publish it in the store.'
          : 'Re-run with --yes to reject it.'
      )
    );
    return;
  }

  const listing = await reviewMarketplaceListing(marketplaceApiUrl, listingId, {
    isApproved,
    reason,
  });
  if (wantsJson(command)) {
    printJson(listing);
    return;
  }
  print(formatSuccess(`Listing ${listing.id} is now ${listing.status}`));
}

export function createMarketplaceCommand(): Command {
  return new Command('marketplace')
    .description('Review store listings on the marketplace API (list, approve, reject)')
    .option(
      '--marketplace-url <url>',
      'Marketplace API URL (default: derived from the profile API URL)'
    )
    .addCommand(
      new Command('listings')
        .description('List store listings, by default the ones waiting for review')
        .option(
          '--status <status>',
          MARKETPLACE_LISTING_STATUSES.join(' | '),
          parseMarketplaceListingStatus,
          ListingStatus.PENDING_REVIEW
        )
        .option('--json', 'Output as JSON')
        .action(async (options: ListingsOptions, command: Command) => {
          try {
            const marketplaceApiUrl = await readMarketplaceApiUrl(command);
            const listings = await readMarketplaceListings(marketplaceApiUrl, options.status);
            if (wantsJson(command)) {
              printJson(listings);
              return;
            }
            print(formatHeader(`Listings with status ${options.status}: ${listings.length}\n`));
            for (const listing of listings) {
              print(
                `${listing.id}  ${listing.type.padEnd(9)} ${formatListingPrice(listing).padStart(12)}  ${listing.title}`
              );
            }
            if (listings.length === 0) print(chalk.dim('Nothing here.'));
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('sync')
        .description(
          'Create or update the free Genfeed preset and skill listings from their sources (preview unless --yes)'
        )
        .option('--only <what>', 'all | presets | skills', parseSyncSelection, 'all')
        .option('--skills-dir <path>', 'A checkout of genfeedai/skills')
        .option('--yes', 'Write the changes to the store')
        .option('--json', 'Output as JSON')
        .action(async (options: SyncOptions, command: Command) => {
          try {
            await runSync(options, command);
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('approve')
        .description('Publish a listing that is waiting for review (preview unless --yes)')
        .argument('<listingId>', 'Listing id')
        .option('--note <text>', 'Moderator note (max 500 characters)')
        .option('--yes', 'Approve the listing')
        .option('--json', 'Output as JSON')
        .action(async (listingId: string, options: ReviewOptions, command: Command) => {
          try {
            await runReview(listingId, true, options, command);
          } catch (error) {
            handleError(error);
          }
        })
    )
    .addCommand(
      new Command('reject')
        .description('Reject a listing that is waiting for review (preview unless --yes)')
        .argument('<listingId>', 'Listing id')
        .requiredOption('--reason <text>', 'Reason shown to the seller (max 500 characters)')
        .option('--yes', 'Reject the listing')
        .option('--json', 'Output as JSON')
        .action(async (listingId: string, options: ReviewOptions, command: Command) => {
          try {
            await runReview(listingId, false, options, command);
          } catch (error) {
            handleError(error);
          }
        })
    );
}

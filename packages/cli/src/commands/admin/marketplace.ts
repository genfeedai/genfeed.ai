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
  formatHeader,
  formatLabel,
  formatSuccess,
  formatWarning,
  print,
  printJson,
} from '@/ui/theme';
import { handleError } from '@/utils/errors';
import { wantsJson } from '@/utils/options';

interface MarketplaceGlobalOptions extends Record<string, unknown> {
  marketplaceUrl?: string;
}

interface ListingsOptions {
  status: ListingStatus;
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

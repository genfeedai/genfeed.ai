import { SubscriptionTier } from '@genfeedai/contracts';
import {
  formatResearchScanLimit,
  RESEARCH_SCAN_LIMITS,
} from '@genfeedai/pricing';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';

/**
 * What a scan limit means, in words until the real Trends capture is added.
 * What each side holds matches the rows of the pricing page's compare table:
 * every account gets the shared market trends feed, a few scans and the saving
 * and remixing of what they find; a plan adds more scans, rescans of watched
 * competitors and trend videos that play inside Genfeed. The numbers are read
 * from `@genfeedai/pricing`, the same place the API reads them.
 */
const FREE_SCANS = formatResearchScanLimit(
  RESEARCH_SCAN_LIMITS[SubscriptionTier.FREE],
);
const PRO_SCANS = formatResearchScanLimit(
  RESEARCH_SCAN_LIMITS[SubscriptionTier.PRO],
);
const SCALE_SCANS = formatResearchScanLimit(
  RESEARCH_SCAN_LIMITS[SubscriptionTier.SCALE],
);

export default function HomeMarket(): React.ReactElement {
  return (
    <section
      id="market"
      className="gen-section-spacing-lg border-b border-foreground/5"
    >
      <div className="container mx-auto px-6">
        <div className="flex max-w-3xl flex-col gap-5" data-reveal="up">
          <Text className="text-xs font-semibold uppercase tracking-label text-foreground/80">
            Before the brief
          </Text>
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-[0.98] tracking-[-0.02em] text-foreground sm:text-6xl"
          >
            Start from what is already working
          </Heading>
          <Text className="max-w-2xl text-base leading-7 text-foreground/80 md:text-lg">
            See what is trending in your market and which ads your competitors
            keep running. Pick one, and Genfeed remixes it on your brand.
          </Text>
        </div>

        <div
          className="mt-12 grid gap-px bg-foreground/10 sm:grid-cols-2"
          data-reveal="up"
        >
          <div className="flex flex-col gap-1 bg-background p-6">
            <Text className="text-sm font-semibold text-foreground">
              Every account
            </Text>
            <Text className="text-sm leading-6 text-foreground/80">
              The shared market trends feed, a trend scan and a competitor ad
              scan of your own ({FREE_SCANS} each), and saving and remixing what
              they find.
            </Text>
          </div>
          <div className="flex flex-col gap-1 bg-background p-6">
            <Text className="text-sm font-semibold text-foreground">
              On a plan
            </Text>
            <Text className="text-sm leading-6 text-foreground/80">
              More scans: {PRO_SCANS} on Pro, {SCALE_SCANS} on Scale. Watched
              competitors rescanned for you, and trend videos that play inside
              Genfeed.{' '}
              <Link
                className="font-semibold underline underline-offset-4"
                href="/pricing"
              >
                See plans
              </Link>
            </Text>
          </div>
        </div>
      </div>
    </section>
  );
}

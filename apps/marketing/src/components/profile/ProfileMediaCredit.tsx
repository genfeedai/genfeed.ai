import { getAppSignUpUrl } from '@data/app-links';
import { modelCatalogHref } from '@data/model-credits';
import type { ProfileMediaCreditProps } from '@props/content/profile.props';
import Link from 'next/link';

const REPORT_EMAIL = 'support@genfeed.ai';

/** A prefilled email to support that names the asset being reported. */
export function buildReportHref(mediaId: string): string {
  const params = new URLSearchParams({
    body: `I want to report this asset on genfeed.ai (id ${mediaId}). Reason:`,
    subject: 'Report content on genfeed.ai',
  });
  return `mailto:${REPORT_EMAIL}?${params.toString().replaceAll('+', '%20')}`;
}

/**
 * Under a public image or video: what made it, a way to make one, and a way
 * to report it.
 */
export default function ProfileMediaCredit({
  mediaId,
  modelKey,
  modelLabel,
}: ProfileMediaCreditProps): React.ReactElement {
  return (
    <p className="flex flex-wrap items-center gap-x-2 px-1 pt-2 text-xs text-foreground/60">
      {modelKey && modelLabel ? (
        <span>
          Made with{' '}
          <Link
            className="font-medium text-foreground hover:text-primary"
            href={modelCatalogHref(modelKey)}
          >
            {modelLabel}
          </Link>
        </span>
      ) : null}
      <a
        className="font-medium text-foreground hover:text-primary"
        href={getAppSignUpUrl()}
      >
        Make your own
      </a>
      <a
        className="ml-auto hover:text-foreground"
        href={buildReportHref(mediaId)}
      >
        Report
      </a>
    </p>
  );
}

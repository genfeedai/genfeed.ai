'use client';

import { modelCatalogHref } from '@data/model-credits';
import {
  buildRecreateHref,
  buildRecreatePrompt,
  formatCompactCount,
  formatMediaDuration,
} from '@data/public-media';
import { trackRecreation } from '@data/public-views';
import { creatorProfilePath } from '@genfeedai/contracts/constants';
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
 * Under a public image or video: who made it, with which model, how long it
 * runs and how many people saw it; then a way to recreate it in Genfeed and a
 * way to report it.
 */
export default function ProfileMediaCredit({
  creatorHandle,
  durationSeconds,
  kind,
  mediaId,
  mediaUrl,
  modelKey,
  modelLabel,
  viewCount,
}: ProfileMediaCreditProps): React.ReactElement {
  const credit = modelKey && modelLabel ? modelLabel : undefined;

  return (
    <div className="space-y-1 px-1 pt-2 text-xs text-foreground/60">
      <p className="flex flex-wrap items-center gap-x-2">
        {creatorHandle ? (
          <Link
            className="font-medium text-foreground hover:text-primary"
            href={creatorProfilePath(creatorHandle)}
          >
            @{creatorHandle}
          </Link>
        ) : null}
        {modelKey && credit ? (
          <span>
            Made with{' '}
            <Link
              className="font-medium text-foreground hover:text-primary"
              href={modelCatalogHref(modelKey)}
            >
              {credit}
            </Link>
          </span>
        ) : null}
        {durationSeconds ? (
          <span>
            <span className="sr-only">Length </span>
            {formatMediaDuration(durationSeconds)}
          </span>
        ) : null}
        {viewCount ? (
          <span>
            {formatCompactCount(viewCount)} {viewCount === 1 ? 'view' : 'views'}
          </span>
        ) : null}
      </p>
      <p className="flex flex-wrap items-center gap-x-2">
        <a
          className="font-medium text-foreground hover:text-primary"
          href={buildRecreateHref(
            buildRecreatePrompt(kind, {
              handle: creatorHandle,
              modelLabel: credit,
              url: mediaUrl,
            }),
          )}
          onClick={() => trackRecreation(mediaId)}
        >
          Recreate in Genfeed
        </a>
        <a
          className="ml-auto hover:text-foreground"
          href={buildReportHref(mediaId)}
        >
          Report
        </a>
      </p>
    </div>
  );
}

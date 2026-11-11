'use client';

import type { LibraryReviewState } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';

/**
 * Where an asset stands in a teammate review. The variant and icon come from
 * the shared Badge status helper, and the label is always text so colour is
 * never the only signal. An asset nobody was asked to review shows nothing.
 */
export default function LibraryReviewBadge({
  className,
  state,
}: {
  className?: string;
  state: LibraryReviewState | null | undefined;
}) {
  const translate = useTranslations('pages.library.teamReview.state');

  if (!state) {
    return null;
  }

  return (
    <Badge className={className} status={state}>
      {translate(state)}
    </Badge>
  );
}

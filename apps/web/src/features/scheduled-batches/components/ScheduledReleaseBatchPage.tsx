'use client';

import { createPublishingApprovalsRoute } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { EmptyState } from '@ui/primitives/empty-state';
import { ArrowLeft, Newspaper, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useScheduledReleaseBatchReview } from '../hooks/use-scheduled-release-batch-review';
import ScheduledReleaseBatchReview from './ScheduledReleaseBatchReview';

/**
 * `/publishing/batches/<approval>`: the full read of a batch that was too big
 * for the chat card, with its one approval (#10134).
 */
export default function ScheduledReleaseBatchPage({
  approvalId,
}: {
  approvalId: string;
}) {
  const translate = useTranslations('pages.publishing.batch');
  const { href } = useOrgUrl();
  const batch = useScheduledReleaseBatchReview(approvalId);

  return (
    <Container
      icon={Newspaper}
      label={translate('pageTitle')}
      leading={
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          href={href(createPublishingApprovalsRoute())}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {translate('back')}
        </Link>
      }
      moduleChrome
      refresh={
        <ButtonRefresh
          isRefreshing={batch.isLoading}
          onClick={() => {
            void batch.refresh();
          }}
        />
      }
      titleVisibility="sr-only"
    >
      {batch.error ? (
        <EmptyState
          className="mx-auto max-w-xl"
          icon={TriangleAlert}
          surface="card"
          title={translate('loadFailed')}
        />
      ) : batch.review ? (
        <ScheduledReleaseBatchReview batch={batch} review={batch.review} />
      ) : batch.isLoading ? null : (
        <EmptyState
          className="mx-auto max-w-xl"
          icon={TriangleAlert}
          surface="card"
          title={translate('loadFailed')}
        />
      )}
    </Container>
  );
}

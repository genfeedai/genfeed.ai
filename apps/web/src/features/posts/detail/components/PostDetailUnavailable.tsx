'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { FileQuestion, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export interface PostDetailUnavailableProps {
  /** `not-found`: the API has no such post. `error`: the load failed and can be retried. */
  kind: 'not-found' | 'error';
  postsListHref: string;
  onRetry?: () => void;
}

/**
 * The editor when there is no post to edit. Both cases stay neutral and always
 * offer a way out; a failed load also offers a retry.
 */
export default function PostDetailUnavailable({
  kind,
  postsListHref,
  onRetry,
}: PostDetailUnavailableProps) {
  const translate = useTranslations('pages.posts.detail');
  const isError = kind === 'error';

  return (
    <div
      className="flex flex-1 items-center justify-center"
      data-testid="post-detail-unavailable"
    >
      <EmptyState
        actions={
          <div className="flex gap-2">
            {isError && onRetry ? (
              <Button
                label={translate('unavailable.tryAgain')}
                onClick={onRetry}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              />
            ) : null}
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              <Link href={postsListHref}>{translate('backToPosts')}</Link>
            </Button>
          </div>
        }
        description={
          isError
            ? translate('unavailable.errorDescription')
            : translate('unavailable.description')
        }
        icon={isError ? TriangleAlert : FileQuestion}
        title={
          isError
            ? translate('unavailable.errorTitle')
            : translate('unavailable.title')
        }
      />
    </div>
  );
}

'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { classifyGenerationFailure } from '@genfeedai/utils/media/generation-failure.util';
import { ClipboardService } from '@services/core/clipboard.service';
import { Button } from '@ui/primitives/button';
import { Pre } from '@ui/primitives/pre';
import { AlertTriangle, ChevronDown, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useCallback, useState } from 'react';

interface StudioPlaygroundFailureNoticeProps {
  assetId: string;
  /** The provider's own error text, kept whole behind the details toggle. */
  rawError?: string | null | undefined;
}

/**
 * A failed generation leads with a short reason; the provider's full error and
 * its request ids stay one click away so support and retries can still use them.
 */
export default function StudioPlaygroundFailureNotice({
  assetId,
  rawError,
}: StudioPlaygroundFailureNoticeProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const [isExpanded, setIsExpanded] = useState(false);
  const detail = rawError?.trim() ?? '';
  const reason = classifyGenerationFailure(detail);
  const detailId = `studio-asset-failure-detail-${assetId}`;

  const copyDetail = useCallback(() => {
    void ClipboardService.getInstance().copyToClipboard(detail);
  }, [detail]);

  return (
    <div
      className="pointer-events-auto relative z-10 flex w-full min-w-0 max-w-full flex-col items-center gap-2 px-3 text-center text-destructive"
      data-testid={`studio-asset-media-status-${assetId}`}
      role="status"
    >
      <AlertTriangle className="size-5 shrink-0" />
      <span className="max-w-full break-words text-xs">
        {translate(`failure.reasons.${reason}`)}
      </span>
      {detail ? (
        <>
          <Button
            ariaLabel={translate(
              isExpanded ? 'failure.hideDetails' : 'failure.showDetails',
            )}
            aria-controls={detailId}
            aria-expanded={isExpanded}
            className="h-auto px-2 py-1 text-2xs text-muted-foreground"
            icon={
              <ChevronDown
                className={`size-3 transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            }
            label={translate(
              isExpanded ? 'failure.hideDetails' : 'failure.showDetails',
            )}
            onClick={() => setIsExpanded((current) => !current)}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
          {isExpanded ? (
            <div className="flex w-full min-w-0 flex-col gap-1" id={detailId}>
              <Pre
                aria-label={translate('failure.detailsLabel')}
                className="max-h-28 w-full select-text overflow-y-auto break-all text-left text-2xs"
                size="xs"
              >
                {detail}
              </Pre>
              <Button
                className="h-auto self-end px-2 py-1 text-2xs text-muted-foreground"
                icon={<Copy className="size-3" />}
                label={translate('failure.copyDetails')}
                onClick={copyDetail}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

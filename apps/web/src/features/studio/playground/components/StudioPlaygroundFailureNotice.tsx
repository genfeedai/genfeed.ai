'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { classifyGenerationFailure } from '@genfeedai/utils/media/generation-failure.util';
import { Button } from '@ui/primitives/button';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

interface StudioPlaygroundFailureNoticeProps {
  assetId: string;
  /** Opens the details dialog that holds the provider's full error. */
  onShowDetails: () => void;
  /** The provider's own error text; details are offered only when present. */
  rawError?: string | null | undefined;
}

/**
 * A failed generation leads with a short reason; the provider's full error and
 * its request ids stay one click away so support and retries can still use them.
 */
export default function StudioPlaygroundFailureNotice({
  assetId,
  onShowDetails,
  rawError,
}: StudioPlaygroundFailureNoticeProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const detail = rawError?.trim() ?? '';
  const reason = classifyGenerationFailure(detail);

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
        <Button
          aria-haspopup="dialog"
          className="h-auto px-2 py-1 text-2xs"
          icon={<ChevronRight className="size-3" />}
          label={translate('failure.showDetails')}
          onClick={onShowDetails}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      ) : null}
    </div>
  );
}

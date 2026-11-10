'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { validateReferenceMentions } from '@genfeedai/helpers/content/reference-mention.util';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import { Button } from '@ui/primitives/button';
import { Label } from '@ui/primitives/label';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StudioCrunRestoreStatus } from '@/features/studio/playground/hooks/useStudioCrunRestore';
import type { StudioGenerateDraftSaveStatus } from '@/features/studio/playground/types';

export interface StudioPlaygroundComposerNoticeProps {
  crunRestoreStatus: StudioCrunRestoreStatus;
  draftSaveStatus: StudioGenerateDraftSaveStatus;
  onRemixVideo: (assetId: string) => void;
  prompt: string;
  referenceValidation: ReturnType<typeof validateReferenceMentions>;
  remixableVideos: AttachmentItem[];
}

/**
 * Notices above the composer: invalid or unused `@` references, a draft that
 * could not be saved, a crun restore that failed and uploaded videos that can
 * be remixed into a storyboard.
 */
export default function StudioPlaygroundComposerNotice({
  crunRestoreStatus,
  draftSaveStatus,
  onRemixVideo,
  prompt,
  referenceValidation,
  remixableVideos,
}: StudioPlaygroundComposerNoticeProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const translateActions = useTranslations('ui.quickActions');

  return (
    <div className="flex flex-wrap items-center gap-2 px-3.5 py-2">
      {referenceValidation.errors.map((error) => (
        <p
          key={error}
          role="alert"
          className="text-xs text-destructive"
          data-testid="studio-reference-mention-error"
        >
          {error}
        </p>
      ))}
      {prompt.trim() && referenceValidation.unusedTokens.length > 0 ? (
        <p
          role="status"
          className="text-xs text-muted-foreground"
          data-testid="studio-reference-mention-notice"
        >
          {translate('referenceMentionNotice', {
            tokens: referenceValidation.unusedTokens.join(', '),
          })}
        </p>
      ) : null}
      {draftSaveStatus === 'error' || draftSaveStatus === 'failed' ? (
        <p
          aria-live="polite"
          className="text-xs text-destructive"
          data-draft-status={draftSaveStatus}
          data-testid="studio-draft-status"
          role="status"
        >
          {draftSaveStatus === 'error'
            ? translate('draft.saveFailed')
            : translate('draft.saveRejected')}
        </p>
      ) : null}
      {crunRestoreStatus === 'failed' ? (
        <Label role="alert">{translate('crun.referenceUnavailable')}</Label>
      ) : null}
      {remixableVideos.map((attachment: AttachmentItem) => (
        <Button
          ariaLabel={`${translateActions('remixThisVideo')}: ${attachment.name}`}
          key={attachment.id}
          label={translateActions('remixThisVideo')}
          onClick={() => {
            if (attachment.ingredientId) onRemixVideo(attachment.ingredientId);
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        />
      ))}
    </div>
  );
}

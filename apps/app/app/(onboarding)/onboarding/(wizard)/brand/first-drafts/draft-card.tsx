import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { FirstDraftCardProps } from '@genfeedai/props/onboarding/first-drafts.props';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { Button } from '@ui/primitives/button';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function DraftCard({
  draft,
  imageUrl,
  videoUrl,
  videoStatus,
  brandName,
  avatarUrl,
  isSaving,
  isMediaGenerating,
  onRetryMedia,
  onVerdict,
  verdict,
}: FirstDraftCardProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const isVideo = draft.platform === 'tiktok';
  const rejected = verdict === 'down';
  const mediaUrl = isVideo ? videoUrl : imageUrl;
  return (
    <div data-testid={`onboarding-draft-${draft.platform}`} className="min-w-0">
      <div className={rejected ? 'opacity-35' : undefined}>
        <PlatformPreview
          target={{
            id: draft.postId,
            platform: draft.platform,
            caption: draft.text,
            author: { name: brandName || t('brandFallback'), avatarUrl },
            media: mediaUrl
              ? [
                  {
                    id: `${draft.postId}-media`,
                    kind: isVideo ? 'short_video' : 'image',
                    url: mediaUrl,
                    alt: t(isVideo ? 'videoAlt' : 'imageAlt', {
                      platform: t(`platforms.${draft.platform}`),
                    }),
                  },
                ]
              : [],
          }}
          headerPresentation="account"
          statusLabel={verdict === 'up' ? t('verdict.kept') : undefined}
          showValidation={false}
        />
        {isVideo && !videoUrl ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p role="status" className="text-xs text-muted-foreground">
              {t(
                videoStatus === 'pending'
                  ? 'review.videoPending'
                  : videoStatus === 'needs_credits'
                    ? 'review.videoNeedsCredits'
                    : 'review.videoFailed',
              )}
            </p>
            {onRetryMedia &&
            videoStatus !== 'pending' &&
            videoStatus !== 'needs_credits' ? (
              <Button
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
                label={t('review.retryMedia')}
                isDisabled={isMediaGenerating}
                onClick={onRetryMedia}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {rejected ? (
          <>
            <span role="status" className="text-xs text-muted-foreground">
              {t('verdict.down')}
            </span>
            <Button
              size={ButtonSize.SM}
              isDisabled={isSaving}
              variant={ButtonVariant.SECONDARY}
              label={t('verdict.undo')}
              onClick={() => onVerdict(draft, null)}
            />
          </>
        ) : (
          <>
            <Button
              size={ButtonSize.SM}
              isDisabled={isSaving}
              variant={
                verdict === 'up'
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
              aria-pressed={verdict === 'up'}
              onClick={() => onVerdict(draft, 'up')}
            >
              <Check className="size-3.5" />
              {t(verdict === 'up' ? 'verdict.kept' : 'verdict.up')}
            </Button>
            <Button
              size={ButtonSize.SM}
              isDisabled={isSaving}
              variant={ButtonVariant.GHOST}
              label={t('verdict.down')}
              onClick={() => onVerdict(draft, 'down')}
            />
          </>
        )}
      </div>
    </div>
  );
}

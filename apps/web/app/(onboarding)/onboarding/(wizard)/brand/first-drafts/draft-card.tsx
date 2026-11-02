import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import PlatformPreview from '@ui/posts/platform-preview/PlatformPreview';
import { Button } from '@ui/primitives/button';
import { Toggle } from '@ui/primitives/toggle';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FirstDraftCardProps } from '@/features/onboarding/props/first-drafts.props';

export default function DraftCard({
  draft,
  images,
  masterUrl,
  brandName,
  avatarUrl,
  isSaving,
  isMediaGenerating,
  onRetryMedia,
  onVerdict,
  verdict,
}: FirstDraftCardProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const rejected = verdict === 'down';
  // A run saved before campaign images has none of its own: it shows the master.
  const mediaUrls =
    images.length > 0
      ? images.flatMap((image) => (image.url ? [image.url] : []))
      : masterUrl
        ? [masterUrl]
        : [];
  const isSlideshow = draft.platform === 'tiktok' && mediaUrls.length > 1;
  const status = images.find((image) => image.status !== 'ready')?.status;
  return (
    <div data-testid={`onboarding-draft-${draft.platform}`} className="min-w-0">
      <div className={rejected ? 'opacity-35' : undefined}>
        <PlatformPreview
          target={{
            id: draft.postId,
            platform: draft.platform,
            caption: draft.text,
            author: { name: brandName || t('brandFallback'), avatarUrl },
            media: mediaUrls.map((url, index) => ({
              id: `${draft.postId}-media-${index}`,
              kind: isSlideshow ? 'carousel' : 'image',
              url,
              alt: t('imageAlt', {
                platform: t(`platforms.${draft.platform}`),
              }),
            })),
          }}
          headerPresentation="account"
          statusLabel={verdict === 'up' ? t('verdict.kept') : undefined}
          showValidation={false}
        />
        {status ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p role="status" className="text-xs text-muted-foreground">
              {t(
                status === 'pending'
                  ? 'review.imagePending'
                  : status === 'needs_credits'
                    ? 'review.imageNeedsCredits'
                    : 'review.imageUnavailable',
              )}
            </p>
            {onRetryMedia && status === 'failed' ? (
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
            <Toggle
              disabled={isSaving}
              onPressedChange={() => onVerdict(draft, 'up')}
              pressed={verdict === 'up'}
              size="sm"
              variant="outline"
            >
              <Check />
              {t(verdict === 'up' ? 'verdict.kept' : 'verdict.up')}
            </Toggle>
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

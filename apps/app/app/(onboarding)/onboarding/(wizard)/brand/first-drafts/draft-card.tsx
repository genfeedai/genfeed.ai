import { CardVariant } from '@genfeedai/contracts';
import type { OnboardingDraftPlatform } from '@genfeedai/contracts/interfaces';
import type { FirstDraftCardProps } from '@genfeedai/props/onboarding/first-drafts.props';
import Card from '@ui/card/Card';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

const IMAGE_PLATFORMS: readonly OnboardingDraftPlatform[] = [
  'twitter',
  'instagram',
  'linkedin',
];

export default function DraftCard({ draft, imageUrl }: FirstDraftCardProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const platform = t(`platforms.${draft.platform}`);
  const hasImage =
    imageUrl !== null && IMAGE_PLATFORMS.includes(draft.platform);

  return (
    <Card variant={CardVariant.BORDERED} label={platform} labelAs="h2">
      <div className="flex flex-col gap-3">
        {hasImage ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
            <Image
              src={imageUrl}
              alt={t('imageAlt', { platform })}
              fill
              unoptimized
              sizes="(min-width: 768px) 45vw, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {draft.text}
        </p>
        {draft.platform === 'tiktok' ? (
          <p className="text-xs text-muted-foreground">
            {t('review.videoNote')}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

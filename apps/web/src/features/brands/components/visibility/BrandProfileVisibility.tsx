'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { ButtonGroup, ButtonGroupText } from '@ui/primitives/button-group';
import { Switch } from '@ui/primitives/switch';
import { ExternalLink, Link2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const URL_SCHEME_PATTERN = /^https?:\/\//;

export interface BrandProfileVisibilityProps {
  isPublic: boolean;
  isUpdating?: boolean;
  profileUrl: string;
  onCopy: () => void;
  onToggle: (isPublic: boolean) => void;
}

/**
 * Who can see the profile, in one control: the visibility switch, then the two
 * things you can only do with a public profile (copy its link, open it). Copy
 * and view are disabled while the profile is private, so the switch is what
 * turns them on.
 */
export default function BrandProfileVisibility({
  isPublic,
  isUpdating = false,
  profileUrl,
  onCopy,
  onToggle,
}: BrandProfileVisibilityProps) {
  const t = useTranslations('pages.brandDetailOverview');

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ButtonGroup aria-label={t('profileVisibility')} className="w-auto">
        <ButtonGroupText>
          <Switch
            aria-label={t('publicProfileSwitch')}
            isChecked={isPublic}
            isDisabled={isUpdating}
            label={t('publicLabel')}
            onCheckedChange={onToggle}
            size="sm"
          />
        </ButtonGroupText>
        <Button
          ariaLabel={t('copyPublicProfileLink')}
          icon={<Link2 className="size-4" />}
          isDisabled={!isPublic}
          onClick={onCopy}
          size={ButtonSize.ICON}
          tooltip={isPublic ? t('copyPublicProfileLink') : t('turnOnPublic')}
          variant={ButtonVariant.SECONDARY}
        />
        {isPublic ? (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={profileUrl} rel="noopener noreferrer" target="_blank">
              <ExternalLink className="size-4" />
              {t('viewPublicProfile')}
            </Link>
          </Button>
        ) : (
          <Button
            icon={<ExternalLink className="size-4" />}
            isDisabled
            label={t('viewPublicProfile')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        )}
      </ButtonGroup>
      <p className="text-sm text-foreground/50">
        {isPublic
          ? profileUrl.replace(URL_SCHEME_PATTERN, '')
          : t('privateHint')}
      </p>
    </div>
  );
}

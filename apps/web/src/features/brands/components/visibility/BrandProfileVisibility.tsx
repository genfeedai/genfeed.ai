'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  inputGroupButtonClassName,
} from '@ui/primitives/input-group';
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
 * Who can see the profile, in one input group: the visibility switch, the
 * profile link, then the two things you can only do with a public profile
 * (copy the link, open it). Copy and open are disabled while the profile is
 * private, so the switch is what turns them on.
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
    <InputGroup aria-label={t('profileVisibility')} className="max-w-md">
      <InputGroupAddon>
        <Switch
          aria-label={t('publicProfileSwitch')}
          isChecked={isPublic}
          isDisabled={isUpdating}
          label={t('publicLabel')}
          onCheckedChange={onToggle}
          size="sm"
        />
      </InputGroupAddon>
      <InputGroupInput
        aria-label={t('publicProfileLink')}
        className={cn(!isPublic && 'text-muted-foreground/60')}
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        value={profileUrl.replace(URL_SCHEME_PATTERN, '')}
      />
      <Button
        ariaLabel={t('copyPublicProfileLink')}
        className={inputGroupButtonClassName}
        icon={<Link2 className="size-4" />}
        isDisabled={!isPublic}
        onClick={onCopy}
        size={ButtonSize.ICON}
        tooltip={isPublic ? t('copyPublicProfileLink') : t('turnOnPublic')}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
      {isPublic ? (
        <Button
          asChild
          className={inputGroupButtonClassName}
          size={ButtonSize.ICON}
          tooltip={t('viewPublicProfile')}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <Link
            aria-label={t('viewPublicProfile')}
            href={profileUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-4" />
          </Link>
        </Button>
      ) : (
        <Button
          ariaLabel={t('viewPublicProfile')}
          className={inputGroupButtonClassName}
          icon={<ExternalLink className="size-4" />}
          isDisabled
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      )}
    </InputGroup>
  );
}

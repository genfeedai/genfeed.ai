'use client';

import { ButtonVariant, PlatformRole } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import type {
  AdminUserDetailRowProps,
  AdminUserDetailSectionProps,
  AdminUserDetailsProps,
} from '@props/admin/admin-user.props';
import { ClipboardService } from '@services/core/clipboard.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { useTranslations } from 'next-intl';
import { EMPTY_VALUE, getUserDisplayName } from './user-display.helpers';
import UserEmail from './user-email';

function formatUserDate(value: string | Date | null | undefined): string {
  return formatDate(value, DATE_FORMATS.DISPLAY_DATETIME) || EMPTY_VALUE;
}

function DetailRow({ label, children }: AdminUserDetailRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-4 py-2.5">
      <DefinitionTerm>{label}</DefinitionTerm>
      <DefinitionDetail className="min-w-0 break-words text-sm">
        {children}
      </DefinitionDetail>
    </div>
  );
}

function DetailSection({ title, children }: AdminUserDetailSectionProps) {
  return (
    <Card label={title}>
      <DefinitionList className="space-y-0 divide-y divide-border">
        {children}
      </DefinitionList>
    </Card>
  );
}

/**
 * Every field the user record carries, shared by the row sidebar and the user
 * page. Fields the record lacks read "—" rather than a placeholder sentence.
 */
export default function UserDetails({
  user,
  className,
}: AdminUserDetailsProps) {
  const translate = useTranslations('pages.adminUsers.detail');
  const attribution = user.signupAttribution;
  const steps = user.onboardingStepsCompleted ?? [];
  const campaignSource = attribution?.utmSource;

  return (
    <div className={cn('grid gap-4', className)}>
      <DetailSection title={translate('sections.profile')}>
        <DetailRow label={translate('name')}>
          {getUserDisplayName(user) ?? EMPTY_VALUE}
        </DetailRow>
        <DetailRow label={translate('handle')}>
          {user.handle || EMPTY_VALUE}
        </DetailRow>
        <DetailRow label={translate('email')}>
          <UserEmail email={user.email} />
        </DetailRow>
        <DetailRow label={translate('id')}>
          <Button
            className="h-auto max-w-full whitespace-normal break-all p-0 text-left font-mono text-xs hover:underline"
            onClick={() => {
              void ClipboardService.getInstance().copyToClipboard(user.id);
            }}
            tooltip={translate('copyId')}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            {user.id}
          </Button>
        </DetailRow>
      </DetailSection>

      <DetailSection title={translate('sections.access')}>
        <DetailRow label={translate('platformRole')}>
          <Badge variant="outline">
            {user.platformRole === PlatformRole.SUPERADMIN
              ? translate('roleSuperadmin')
              : translate('roleUser')}
          </Badge>
        </DetailRow>
        <DetailRow label={translate('joined')}>
          {formatUserDate(user.createdAt)}
        </DetailRow>
        <DetailRow label={translate('lastConnected')}>
          {formatUserDate(user.lastActiveAt)}
        </DetailRow>
      </DetailSection>

      <DetailSection title={translate('sections.onboarding')}>
        <DetailRow label={translate('onboardingStatus')}>
          {user.isOnboardingCompleted
            ? translate('onboardingDone')
            : translate('onboardingPending')}
        </DetailRow>
        <DetailRow label={translate('onboardingType')}>
          {user.onboardingType ?? EMPTY_VALUE}
        </DetailRow>
        <DetailRow label={translate('onboardingStarted')}>
          {formatUserDate(user.onboardingStartedAt)}
        </DetailRow>
        <DetailRow label={translate('onboardingCompleted')}>
          {formatUserDate(user.onboardingCompletedAt)}
        </DetailRow>
        <DetailRow label={translate('onboardingSteps')}>
          {steps.length > 0 ? steps.join(', ') : EMPTY_VALUE}
        </DetailRow>
      </DetailSection>

      <DetailSection title={translate('sections.signup')}>
        <DetailRow label={translate('sourceCampaign')}>
          {campaignSource || EMPTY_VALUE}
        </DetailRow>
        <DetailRow label={translate('sourceMedium')}>
          {attribution?.utmMedium || EMPTY_VALUE}
        </DetailRow>
        <DetailRow label={translate('sourceCampaignName')}>
          {attribution?.utmCampaign || EMPTY_VALUE}
        </DetailRow>
        <DetailRow label={translate('sourceContent')}>
          {attribution?.utmContent || EMPTY_VALUE}
        </DetailRow>
        <DetailRow label={translate('referrer')}>
          {attribution?.referrerDomain || EMPTY_VALUE}
        </DetailRow>
        <DetailRow label={translate('landingPath')}>
          {attribution?.landingPath || EMPTY_VALUE}
        </DetailRow>
      </DetailSection>
    </div>
  );
}

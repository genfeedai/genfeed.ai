'use client';

import { ButtonSize, ButtonVariant, PlatformRole } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ClipboardService } from '@services/core/clipboard.service';
import { UsersService } from '@services/organization/users.service';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { getErrorMessage } from '@utils/error/error-handler.util';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type {
  AdminUserDetailRowProps,
  AdminUserDetailSectionProps,
  AdminUserDetailsProps,
} from '@/features/admin/props/admin-user.props';
import { EMPTY_VALUE, getUserDisplayName } from './user-display.helpers';
import UserEmail from './user-email';

function formatUserDate(value: string | Date | null | undefined): string {
  return formatDate(value, DATE_FORMATS.DISPLAY_DATETIME) || EMPTY_VALUE;
}

function DetailRow({ label, children }: AdminUserDetailRowProps) {
  return (
    <DefinitionList className="grid space-y-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-4 py-2.5">
      <DefinitionTerm>{label}</DefinitionTerm>
      <DefinitionDetail className="min-w-0 break-words text-sm">
        {children}
      </DefinitionDetail>
    </DefinitionList>
  );
}

function DetailSection({
  title,
  children,
  action,
  footer,
}: AdminUserDetailSectionProps) {
  return (
    <Card label={title} headerAction={action} actions={footer}>
      <div className="space-y-0 divide-y divide-border">{children}</div>
    </Card>
  );
}

/**
 * Every field the user record carries, shared by the row sidebar and the user
 * page. Fields the record lacks read "—" rather than a placeholder sentence.
 */
export default function UserDetails({
  user: initialUser,
  className,
  onUpdated,
}: AdminUserDetailsProps) {
  const translate = useTranslations('pages.adminUsers.detail');
  const [user, setUser] = useState(initialUser);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    handle: '',
  });
  const saving = useRef(false);
  const getService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  async function save(action: 'profile' | 'reset') {
    if (saving.current) return;
    saving.current = true;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const service = await getService();
      const updated =
        action === 'profile'
          ? await service.updateAdminProfile(user.id, profile)
          : await service.resetOnboarding(user.id);
      setUser(updated);
      setIsEditing(false);
      setIsConfirmingReset(false);
      setNotice(
        action === 'profile'
          ? translate('profileSaved')
          : translate('onboardingReset'),
      );
      onUpdated?.(updated);
    } catch (error) {
      setError(getErrorMessage(error, translate('saveFailed')));
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  const attribution = user.signupAttribution;
  const steps = user.onboardingStepsCompleted ?? [];
  const campaignSource = attribution?.utmSource;

  return (
    <div className={cn('grid gap-4', className)}>
      <DetailSection
        title={translate('sections.profile')}
        action={
          !isEditing ? (
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              icon={<Pencil className="size-3.5" />}
              label={translate('editProfile')}
              isDisabled={isSaving || isConfirmingReset}
              onClick={() => {
                setProfile({
                  firstName:
                    user.firstName || (!user.lastName ? (user.name ?? '') : ''),
                  lastName: user.lastName ?? '',
                  handle: user.handle ?? '',
                });
                setError(null);
                setNotice(null);
                setIsEditing(true);
              }}
            />
          ) : undefined
        }
      >
        {isEditing ? (
          <div className="py-2.5">
            <Form
              aria-label={translate('editProfile')}
              onSubmit={(event) => {
                event.preventDefault();
                void save('profile');
              }}
            >
              <Input
                label={translate('firstName')}
                value={profile.firstName}
                maxLength={100}
                isDisabled={isSaving}
                onChange={(event) =>
                  setProfile({ ...profile, firstName: event.target.value })
                }
                autoFocus
              />
              <Input
                label={translate('lastName')}
                value={profile.lastName}
                maxLength={100}
                isDisabled={isSaving}
                onChange={(event) =>
                  setProfile({ ...profile, lastName: event.target.value })
                }
              />
              <Input
                label={translate('handle')}
                value={profile.handle}
                maxLength={100}
                isRequired
                isDisabled={isSaving}
                onChange={(event) =>
                  setProfile({ ...profile, handle: event.target.value })
                }
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  label={translate('save')}
                  isLoading={isSaving}
                  isDisabled={isSaving || !profile.handle.trim()}
                />
                <Button
                  label={translate('cancel')}
                  variant={ButtonVariant.SECONDARY}
                  isDisabled={isSaving}
                  onClick={() => {
                    setIsEditing(false);
                    setError(null);
                  }}
                />
              </div>
            </Form>
          </div>
        ) : (
          <>
            <DetailRow label={translate('name')}>
              {getUserDisplayName(user) ?? EMPTY_VALUE}
            </DetailRow>
            <DetailRow label={translate('handle')}>
              {user.handle || EMPTY_VALUE}
            </DetailRow>
            {notice ? (
              <p role="status" className="py-2 text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}
          </>
        )}
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

      <DetailSection
        title={translate('sections.onboarding')}
        footer={
          <div className="space-y-3">
            {isConfirmingReset ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {translate('resetWarning')}
                </p>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    label={translate('confirmReset')}
                    isDisabled={isSaving}
                    isLoading={isSaving}
                    onClick={() => {
                      void save('reset');
                    }}
                  />
                  <Button
                    label={translate('cancel')}
                    variant={ButtonVariant.SECONDARY}
                    isDisabled={isSaving}
                    onClick={() => {
                      setIsConfirmingReset(false);
                      setError(null);
                    }}
                  />
                </div>
              </>
            ) : (
              <Button
                label={translate('resetOnboarding')}
                variant={ButtonVariant.SECONDARY}
                isDisabled={isSaving || isEditing}
                onClick={() => {
                  setIsConfirmingReset(true);
                  setError(null);
                  setNotice(null);
                }}
              />
            )}
          </div>
        }
      >
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

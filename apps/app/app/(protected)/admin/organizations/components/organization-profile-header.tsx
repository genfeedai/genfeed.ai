'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IOrgWithStats } from '@services/analytics/analytics.service';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { OrganizationProfileHeaderProps } from '@/features/admin/props/organization-profile.props';

/** Who the organization is: logo, name, type, owner, slug, created, counts. */
export default function OrganizationProfileHeader({
  isLoading,
  profile,
}: OrganizationProfileHeaderProps) {
  const translate = useTranslations('pages.adminOrganizations');

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-4"
        data-testid="org-profile-loading"
      >
        <Skeleton className="size-14 rounded-full" />
        <Skeleton variant="text" height={20} className="w-48" />
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <header className="flex items-center gap-4">
      <OrganizationAvatar profile={profile} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-xl font-semibold text-foreground">
            {profile.name}
          </h2>
          {profile.type ? (
            <Badge variant="outline">
              {translate(`types.${profile.type}`)}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/60">
          {profile.owner ? (
            <span>
              {translate('ownerLabel')}:{' '}
              <Link
                className="text-foreground hover:text-primary"
                href={`${APP_ROUTES.ADMIN.ADMINISTRATION.USERS}/${profile.owner.id}`}
              >
                {profile.owner.name}
              </Link>
            </span>
          ) : null}
          {profile.slug ? <span>{profile.slug}</span> : null}
          {profile.createdAt ? (
            <span>
              {translate('createdLabel')}{' '}
              {format(new Date(profile.createdAt), 'MMM d, yyyy')}
            </span>
          ) : null}
          <span>
            {translate('membersLabel')}: {profile.totalMembers}
          </span>
          <span>
            {translate('brandsLabel')}: {profile.totalBrands}
          </span>
        </p>
      </div>
    </header>
  );
}

function OrganizationAvatar({ profile }: { profile: IOrgWithStats }) {
  return (
    <Avatar className="size-14">
      {profile.logo ? (
        <AvatarImage alt={profile.name} src={profile.logo} />
      ) : null}
      <AvatarFallback className="text-lg font-semibold">
        {(profile.name || 'U').charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

'use client';

import { authClient } from '@genfeedai/auth-client';
import { PlatformRole } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { UsersService } from '@services/organization/users.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Users, VenetianMask } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

function formatUserName(user: IUser, fallback: string): string {
  const splitName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return user.name?.trim() || splitName || fallback;
}

/**
 * First-touch source: UTM source/medium when tagged, else the referring site,
 * else "Direct". Users whose source was never captured read "Unknown".
 */
function formatSignupSource(
  user: IUser,
  labels: { direct: string; unknown: string },
): string {
  const attribution = user.signupAttribution;
  if (!attribution) {
    return labels.unknown;
  }

  const campaign = [attribution.utmSource, attribution.utmMedium]
    .filter(Boolean)
    .join(' / ');
  const source = campaign || attribution.referrerDomain || labels.direct;

  return attribution.landingPath
    ? `${source} → ${attribution.landingPath}`
    : source;
}

function formatUserDate(
  value: string | null | undefined,
  fallback: string,
): string {
  return formatDate(value, DATE_FORMATS.DISPLAY_DATETIME) || fallback;
}

export default function UsersList() {
  const translate = useTranslations('pages.adminUsers');
  const notificationsService = NotificationsService.getInstance();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const {
    data: users,
    isLoading,
    isFetching,
    error: usersError,
    refetch,
  } = useQuery<IUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const service = await getUsersService();
      return service.findAll();
    },
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (usersError) {
      logger.error('GET /users failed', usersError);
    }
  }, [usersError]);

  const refresh = () => {
    refetch();
  };

  const handleImpersonate = async (user: IUser) => {
    try {
      const { error } = await authClient.admin.impersonateUser({
        userId: user.id,
      });
      if (error) {
        throw new Error(error.message ?? 'Impersonation request failed');
      }
      // Full navigation (not router.push) so every cached query, token, and
      // org-scoped store rebuilds from the impersonated session.
      window.location.assign(APP_ROUTES.ROOT);
    } catch (error) {
      logger.error('Failed to impersonate user', error);
      notificationsService.error(translate('impersonateFailed'));
    }
  };

  const sourceLabels = {
    direct: translate('source.direct'),
    unknown: translate('source.unknown'),
  };

  const columns: TableColumn<IUser>[] = [
    {
      header: translate('columns.name'),
      key: 'name',
      render: (u: IUser) => formatUserName(u, translate('noName')),
    },
    {
      header: translate('columns.email'),
      key: 'email',
      render: (u: IUser) => u.email || translate('noEmail'),
    },
    {
      header: translate('columns.source'),
      key: 'signupAttribution',
      render: (u: IUser) => formatSignupSource(u, sourceLabels),
    },
    {
      header: translate('columns.joined'),
      key: 'createdAt',
      render: (u: IUser) => formatUserDate(u.createdAt, '—'),
    },
    {
      header: translate('columns.lastConnected'),
      key: 'lastActiveAt',
      render: (u: IUser) => formatUserDate(u.lastActiveAt, translate('never')),
    },
  ];

  const actions: TableAction<IUser>[] = [
    {
      icon: <VenetianMask />,
      // The admin plugin rejects impersonating other admins, so hide the
      // action instead of offering a guaranteed 403 (this also covers the
      // operator's own row — superadmin-only surface, superadmin operator).
      isVisible: (u: IUser) => u.platformRole !== PlatformRole.SUPERADMIN,
      onClick: (u: IUser) => {
        void handleImpersonate(u);
      },
      tooltip: translate('impersonate'),
    },
  ];

  return (
    <Container
      label={translate('title')}
      description={translate('description')}
      icon={Users}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      <AppTable<IUser>
        items={users || []}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(u) => u.id}
        emptyLabel={translate('empty')}
      />
    </Container>
  );
}

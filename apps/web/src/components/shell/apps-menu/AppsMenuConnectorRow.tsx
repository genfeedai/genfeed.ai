'use client';

import { useConnectGenfeedStatus } from '@app/(protected)/home/use-connect-genfeed-status';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import DateText from '@ui/time/DateText';
import { Plug } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import AppsMenuRow from '@/components/shell/apps-menu/AppsMenuRow';
import type { AppsMenuConnectorRowProps } from '@/props/ui/apps-menu.props';

/**
 * The MCP connector: Connect until an agent has verified a connection, then
 * the agent's name and when it was verified, with Manage. It mounts when the
 * menu opens, so the connection read costs nothing until someone looks.
 */
export default function AppsMenuConnectorRow({
  connectHref,
  onNavigate,
}: AppsMenuConnectorRowProps) {
  const translate = useTranslations('common.appsMenu');
  const { organizationId } = useBrand();
  const connection = useConnectGenfeedStatus(organizationId);
  const isConnected = connection.status === 'configured';
  const agentName = connection.connections[0]?.clientName;

  return (
    <AppsMenuRow
      action={
        connectHref ? (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={isConnected ? ButtonVariant.GHOST : ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            <Link href={connectHref} onClick={onNavigate}>
              {isConnected ? null : (
                <Plug aria-hidden="true" className="size-4" />
              )}
              {isConnected ? translate('mcp.manage') : translate('mcp.connect')}
            </Link>
          </Button>
        ) : null
      }
      badge={
        isConnected ? (
          <Badge variant="success">{translate('mcp.connected')}</Badge>
        ) : null
      }
      icon={Plug}
      subtitle={
        isConnected ? (
          <>
            {agentName ?? translate('mcp.unknownAgent')}
            {' · '}
            {translate('mcp.verified')}{' '}
            <DateText value={connection.verifiedAt} />
          </>
        ) : (
          translate('mcp.subtitle')
        )
      }
      testId="apps-row-mcp"
      title={translate('mcp.title')}
    />
  );
}

'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { MemberRole } from '@genfeedai/contracts';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * The organization half of "Require approval for MCP requests". The organization owns the
 * credit pool, so approvals stay on until an owner or admin turns them off, and a member's
 * own setting can only relax the organization's choice. The API enforces the same role on
 * the settings PATCH; this card only mirrors it.
 */
export default function OrganizationMcpApprovalCard() {
  const translate = useTranslations('common.settings.organizationMcpApproval');
  const { organizationId } = useBrand();
  const { isLoading, settings, updateSettings } = useOrganization();
  const role = useUserRole();
  const canManage = role === MemberRole.OWNER || role === MemberRole.ADMIN;
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAvailable = Boolean(organizationId && settings && !isLoading);
  const isRequired = settings?.isMcpApprovalRequired !== false;

  async function change(isEnabled: boolean) {
    if (!canManage || !isAvailable || isPending) return;
    setIsPending(true);
    setError(null);
    setNotice(null);
    try {
      await updateSettings('isMcpApprovalRequired', isEnabled);
      setNotice(translate('saved'));
    } catch (failure: unknown) {
      logger.error('Failed to update MCP approval policy', failure);
      setError(translate('saveFailed'));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card label={translate('title')} bodyClassName="gap-3 p-4">
      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          {translate('adminOnly')}
        </p>
      ) : null}
      <Switch
        aria-label={translate('label')}
        description={translate('switchDescription')}
        isChecked={isRequired}
        isDisabled={!canManage || !isAvailable || isPending}
        label={translate('label')}
        onCheckedChange={(isEnabled) => {
          void change(isEnabled);
        }}
      />
      {!isRequired ? (
        <p className="text-xs text-muted-foreground">{translate('risk')}</p>
      ) : null}
      {isLoading ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('loading')}
        </p>
      ) : null}
      {isPending ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('saving')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}

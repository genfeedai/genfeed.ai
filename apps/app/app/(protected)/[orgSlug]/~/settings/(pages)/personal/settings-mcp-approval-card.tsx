'use client';

import Card from '@ui/card/Card';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import type { SettingsMcpApprovalCardProps } from '@/features/settings/props/settings-mcp-approval-card.props';
import { useOrganization } from '@/hooks/data/organization/use-organization/use-organization';

/**
 * Settings → Personal: the member half of "Require approval for MCP requests". It can only
 * relax the organization's choice, so while the organization requires approval the switch
 * stays on and says why.
 */
export default function SettingsMcpApprovalCard({
  isRequired,
  isSaving,
  onChange,
}: SettingsMcpApprovalCardProps) {
  const translate = useTranslations('common.settings.profile.mcpApproval');
  const { settings } = useOrganization();
  const isOrganizationRequired = settings?.isMcpApprovalRequired !== false;

  return (
    <Card bodyClassName="gap-3 p-4" label={translate('cardTitle')}>
      <Switch
        aria-label={translate('label')}
        description={translate('switchDescription')}
        isChecked={isOrganizationRequired || isRequired}
        isDisabled={isSaving || isOrganizationRequired}
        label={translate('label')}
        onCheckedChange={onChange}
      />
      {isOrganizationRequired ? (
        <p className="text-xs text-muted-foreground">
          {translate('organizationRequired')}
        </p>
      ) : null}
    </Card>
  );
}

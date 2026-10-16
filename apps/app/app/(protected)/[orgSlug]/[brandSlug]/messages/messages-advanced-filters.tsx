import { PLATFORM_CONFIG } from '@genfeedai/contracts/constants';
import type { SocialAutomationState } from '@genfeedai/contracts/interfaces';
import type { MessagesAdvancedFiltersProps } from '@genfeedai/props/messages/messages-inbox-filters.props';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { AUTOMATION_OPTIONS } from './messages-page.helpers';

export default function MessagesAdvancedFilters({
  accounts,
  assignedOwnerId,
  automationState,
  credentialId,
  onAssignedOwnerIdChange,
  onAutomationStateChange,
  onCredentialIdChange,
}: MessagesAdvancedFiltersProps) {
  const translate = useTranslations('common.messages');
  return (
    <div className="space-y-2">
      <Select
        value={automationState}
        onValueChange={(value) =>
          onAutomationStateChange(value as SocialAutomationState | 'all')
        }
      >
        <SelectTrigger
          aria-label={translate('actions.automation')}
          className="w-full"
        >
          <span className="min-w-0 truncate">
            <span className="shrink-0 text-muted-foreground">
              {translate('actions.automation')}:{' '}
            </span>
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {AUTOMATION_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={credentialId || 'all'}
        onValueChange={(value) =>
          onCredentialIdChange(value === 'all' ? '' : value)
        }
      >
        <SelectTrigger
          aria-label={translate('sidebar.filterByAccountAria')}
          className="normal-case"
        >
          <span className="min-w-0 truncate">
            <span className="shrink-0 text-muted-foreground">
              {translate('sidebar.account')}:{' '}
            </span>
            <SelectValue placeholder={translate('sidebar.allAccounts')} />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {translate('sidebar.allAccounts')}
          </SelectItem>
          {accounts.map((credential) => (
            <SelectItem
              className="normal-case"
              key={credential.id}
              value={credential.id}
            >
              {PLATFORM_CONFIG[String(credential.platform).toLowerCase()]
                ?.label ?? String(credential.platform)}
              {credential.externalHandle ||
              credential.externalName ||
              credential.label
                ? ` · ${credential.externalHandle || credential.externalName || credential.label}`
                : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label={translate('sidebar.assignedOwnerId')}
        placeholder={translate('sidebar.assignedOwnerId')}
        value={assignedOwnerId}
        onChange={(event) => onAssignedOwnerIdChange(event.target.value)}
      />
    </div>
  );
}

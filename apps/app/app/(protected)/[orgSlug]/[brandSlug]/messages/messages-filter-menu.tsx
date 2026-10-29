import { SocialConversationType } from '@genfeedai/contracts';
import { PLATFORM_CONFIG } from '@genfeedai/contracts/constants';
import type { SocialPlatform } from '@genfeedai/contracts/interfaces';
import type {
  MessagesInboxView,
  MessagesSurface,
} from '@genfeedai/props/messages/messages-conversation-sidebar.props';
import type { MessagesFilterMenuProps } from '@genfeedai/props/messages/messages-filter-menu.props';
import FilterMenu from '@ui/content/filter-menu/FilterMenu';
import { useTranslations } from 'next-intl';
import { ALL_BRANDS_FILTER, AUTOMATION_OPTIONS } from './messages-page.helpers';

export const DEFAULT_MESSAGES_VIEW: MessagesInboxView = 'inbox';

const VIEW_OPTIONS = [
  'inbox',
  'unread',
  'review',
  'resolved',
  'archived',
  'all',
] as const satisfies readonly MessagesInboxView[];

const SURFACE_OPTIONS = [
  { messageKey: 'all', value: 'all' },
  { messageKey: 'dms', value: SocialConversationType.DM },
  { messageKey: 'replies', value: SocialConversationType.REPLY },
  { messageKey: 'comments', value: SocialConversationType.COMMENT },
] as const satisfies ReadonlyArray<{
  messageKey: 'all' | 'comments' | 'dms' | 'replies';
  value: MessagesSurface;
}>;

const PLATFORM_OPTIONS = [
  'all',
  'youtube',
  'instagram',
  'tiktok',
  'twitter',
  'linkedin',
] as const satisfies ReadonlyArray<SocialPlatform | 'all'>;

/**
 * Every inbox narrowing — status, type, brand, platform, automation, account —
 * as facets of the shared Filters menu, so the conversation list has no
 * in-content selects. Status defaults to Inbox; the page keeps it in `?status=`.
 */
export default function MessagesFilterMenu({
  accounts,
  automationState,
  brandFilter,
  brandOptions,
  conversationType,
  credentialId,
  defaultBrandFilter,
  onAutomationStateChange,
  onBrandFilterChange,
  onClear,
  onConversationTypeChange,
  onCredentialIdChange,
  onPlatformChange,
  onViewChange,
  platform,
  view,
}: MessagesFilterMenuProps) {
  const translate = useTranslations('common.messages');

  return (
    <FilterMenu
      facets={[
        {
          defaultValue: DEFAULT_MESSAGES_VIEW,
          key: 'status',
          label: translate('sidebar.status'),
          onChange: (value) => onViewChange(value as MessagesInboxView),
          options: VIEW_OPTIONS.map((value) => ({
            label: translate(`sidebar.views.${value}`),
            value,
          })),
          selection: 'single',
          value: view,
        },
        {
          defaultValue: 'all',
          key: 'type',
          label: translate('sidebar.type'),
          onChange: (value) =>
            onConversationTypeChange(value as MessagesSurface),
          options: SURFACE_OPTIONS.map(({ messageKey, value }) => ({
            label: translate(`sidebar.surfaces.${messageKey}`),
            value,
          })),
          selection: 'single',
          value: conversationType,
        },
        ...(brandOptions.length > 0
          ? [
              {
                defaultValue: defaultBrandFilter,
                key: 'brand',
                label: translate('sidebar.brand'),
                onChange: onBrandFilterChange,
                options: [
                  {
                    label: translate('sidebar.allBrands'),
                    value: ALL_BRANDS_FILTER,
                  },
                  ...brandOptions.map((option) => ({
                    isLiteral: true,
                    label: option.label,
                    value: option.id,
                  })),
                ],
                selection: 'single' as const,
                value: brandFilter,
              },
            ]
          : []),
        {
          defaultValue: 'all',
          key: 'platform',
          label: translate('sidebar.platform'),
          onChange: (value) =>
            onPlatformChange(value as SocialPlatform | 'all'),
          options: PLATFORM_OPTIONS.map((value) => ({
            label: translate(`sidebar.platforms.${value}`),
            value,
          })),
          selection: 'single',
          value: platform,
        },
        {
          defaultValue: 'all',
          key: 'automation',
          label: translate('actions.automation'),
          onChange: (value) =>
            onAutomationStateChange(value as typeof automationState),
          options: AUTOMATION_OPTIONS,
          selection: 'single',
          value: automationState,
        },
        {
          defaultValue: 'all',
          key: 'account',
          label: translate('sidebar.account'),
          onChange: (value) =>
            onCredentialIdChange(value === 'all' ? '' : value),
          options: [
            { label: translate('sidebar.allAccounts'), value: 'all' },
            ...accounts.map((credential) => {
              const platformLabel =
                PLATFORM_CONFIG[String(credential.platform).toLowerCase()]
                  ?.label ?? String(credential.platform);
              const handle =
                credential.externalHandle ||
                credential.externalName ||
                credential.label;
              return {
                isLiteral: true,
                label: handle ? `${platformLabel} · ${handle}` : platformLabel,
                value: credential.id,
              };
            }),
          ],
          searchPlaceholder: translate('sidebar.account'),
          selection: 'single',
          value: credentialId || 'all',
        },
      ]}
      onClear={onClear}
    />
  );
}

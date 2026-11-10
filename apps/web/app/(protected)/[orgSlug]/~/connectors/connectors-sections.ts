import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  ConnectorsSection,
  ConnectorsSectionConfig,
} from '@genfeedai/props/pages/connectors.props';
import type { LucideIcon } from 'lucide-react';
import { Bot, Key, Plug, PlugZap, UsersRound, Webhook } from 'lucide-react';

/** The Connectors sections, in the order the section menu lists them. */
export const CONNECTORS_SECTIONS: readonly ConnectorsSectionConfig[] = [
  {
    icon: Bot,
    labelKey: 'agents',
    path: APP_ROUTES.CONNECTORS.AGENTS,
    section: 'agents',
  },
  {
    icon: UsersRound,
    labelKey: 'channels',
    path: APP_ROUTES.CONNECTORS.CHANNELS,
    section: 'channels',
  },
  {
    icon: PlugZap,
    labelKey: 'providers',
    path: APP_ROUTES.CONNECTORS.PROVIDERS,
    section: 'providers',
  },
  {
    icon: Key,
    labelKey: 'apiKeys',
    path: APP_ROUTES.CONNECTORS.API_KEYS,
    section: 'api-keys',
  },
  {
    icon: Webhook,
    labelKey: 'webhooks',
    path: APP_ROUTES.CONNECTORS.WEBHOOKS,
    section: 'webhooks',
  },
];

export const CONNECTORS_ICON = Plug;

export function isConnectorsSection(
  value: string | null,
): value is ConnectorsSection {
  return CONNECTORS_SECTIONS.some((config) => config.section === value);
}

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import {
  CONNECT_CLIENTS,
  type ConnectClientTabId,
} from '@genfeedai/helpers/integrations/connect-genfeed-clients.helper';
import ConnectClientMarks from '@ui/feedback/connect-client-marks/ConnectClientMarks';
import { Bot, Key, PlugZap, SquareTerminal, Webhook } from 'lucide-react';
import { createElement } from 'react';

/** The query parameter that picks the agent on the Agents page. */
export const CONNECTORS_AGENT_PARAM = 'client';

/** The agent the Agents page opens on, as the MCP setup page does. */
export const DEFAULT_CONNECTORS_AGENT: ConnectClientTabId = 'claude';

/** Clients without an application mark get a generic icon. */
const AGENT_FALLBACK_ICONS: Partial<
  Record<ConnectClientTabId, MenuItemConfig['outline']>
> = {
  'agent-prompt': SquareTerminal,
  'other-clients': Bot,
};

/**
 * One row per agent, the same list and marks as the MCP setup page tabs. The
 * default agent keeps the bare Agents URL; the others add `?client=<id>`.
 */
const AGENT_MENU_ITEMS: MenuItemConfig[] = CONNECT_CLIENTS.map(
  (client): MenuItemConfig => {
    const isDefault = client.id === DEFAULT_CONNECTORS_AGENT;
    const fallbackIcon = AGENT_FALLBACK_ICONS[client.id];
    return {
      group: 'Agents',
      href: isDefault
        ? APP_ROUTES.CONNECTORS.AGENTS
        : `${APP_ROUTES.CONNECTORS.AGENTS}?${CONNECTORS_AGENT_PARAM}=${client.id}`,
      icon:
        client.marks.length > 0
          ? createElement(ConnectClientMarks, { marks: client.marks })
          : undefined,
      isCollapsible: isDefault,
      label: client.label,
      matchPaths: isDefault
        ? [APP_ROUTES.CONNECTORS.ROOT, APP_ROUTES.CONNECTORS.AGENTS]
        : [APP_ROUTES.CONNECTORS.AGENTS],
      matchSearchParams: {
        [CONNECTORS_AGENT_PARAM]: isDefault ? null : client.id,
      },
      outline: fallbackIcon,
      solid: fallbackIcon,
    };
  },
);

/**
 * What an organization connects. Agents is a group with one row per agent;
 * the other sections are one row each. A brand's social accounts are not here:
 * they are connected from the brand's Profile.
 *
 * Every section opens at both `/:org/~/connectors/*` and
 * `/:org/:brand/connectors/*`, so `hrefScope` stays unset and navigation keeps
 * the scope the page was opened in.
 */
export const CONNECTORS_MENU_ITEMS: MenuItemConfig[] = [
  ...AGENT_MENU_ITEMS,
  {
    group: '',
    hasDividerAbove: true,
    href: APP_ROUTES.CONNECTORS.PROVIDERS,
    label: 'AI providers',
    matchPaths: [APP_ROUTES.CONNECTORS.PROVIDERS],
    outline: PlugZap,
    solid: PlugZap,
  },
  {
    group: '',
    href: APP_ROUTES.CONNECTORS.API_KEYS,
    label: 'API keys',
    matchPaths: [APP_ROUTES.CONNECTORS.API_KEYS],
    outline: Key,
    solid: Key,
  },
  {
    group: '',
    href: APP_ROUTES.CONNECTORS.WEBHOOKS,
    label: 'Webhooks',
    matchPaths: [APP_ROUTES.CONNECTORS.WEBHOOKS],
    outline: Webhook,
    solid: Webhook,
  },
];

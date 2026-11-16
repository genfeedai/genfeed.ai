import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import { Bot, Key, PlugZap, Webhook } from 'lucide-react';

/**
 * What an organization connects, one sidebar row per section. A brand's social
 * accounts are not here: they are connected from the brand's Profile.
 *
 * Every section opens at both `/:org/~/connectors/*` and
 * `/:org/:brand/connectors/*`, so `hrefScope` stays unset and navigation keeps
 * the scope the page was opened in.
 */
export const CONNECTORS_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.CONNECTORS.AGENTS,
    label: 'Agents',
    matchPaths: [APP_ROUTES.CONNECTORS.ROOT, APP_ROUTES.CONNECTORS.AGENTS],
    outline: Bot,
    solid: Bot,
  },
  {
    group: '',
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

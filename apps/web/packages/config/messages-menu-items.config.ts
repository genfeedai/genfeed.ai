import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';

/**
 * Messages has no module nav: `/messages` is the inbox, and the sidebar is the
 * conversation search and list rendered by the inbox panel. Outreach sequences,
 * the author-reply bot and Reply drip keep their routes but no menu rows.
 */
export const MESSAGES_MENU_ITEMS: MenuItemConfig[] = [];

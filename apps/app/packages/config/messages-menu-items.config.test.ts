import { describe, expect, it } from 'vitest';
import {
  getMessagesMenuItemsForScope,
  isOrgMessagesRouteScope,
  MESSAGES_MENU_ITEMS,
} from './messages-menu-items.config';

describe('MESSAGES_MENU_ITEMS', () => {
  it('is Overview and Inbox only (#5502)', () => {
    expect(MESSAGES_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Overview',
      'Inbox',
    ]);
    expect(MESSAGES_MENU_ITEMS.map((item) => item.href)).toEqual([
      '/messages/overview',
      '/messages',
    ]);
  });

  it('keeps Outreach, the reply bot and Reply drip out of the menu', () => {
    for (const href of [
      '/messages/outreach',
      '/messages/replies',
      '/messages/reply-drip',
    ]) {
      expect(MESSAGES_MENU_ITEMS.some((item) => item.href === href)).toBe(
        false,
      );
    }
  });

  it('marks every destination as primary so the inbox panel keeps them visible', () => {
    expect(MESSAGES_MENU_ITEMS.every((item) => item.isPrimary === true)).toBe(
      true,
    );
  });

  it('treats empty and tilde brand slugs as org messages scope', () => {
    expect(isOrgMessagesRouteScope('')).toBe(true);
    expect(isOrgMessagesRouteScope('~')).toBe(true);
    expect(isOrgMessagesRouteScope('default')).toBe(false);
  });

  it('offers the same Overview and Inbox at organization and brand scope', () => {
    expect(getMessagesMenuItemsForScope('~').map((item) => item.href)).toEqual([
      '/messages/overview',
      '/messages',
    ]);
    expect(
      getMessagesMenuItemsForScope('default').map((item) => item.href),
    ).toEqual(['/messages/overview', '/messages']);
  });
});

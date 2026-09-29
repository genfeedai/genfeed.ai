import { describe, expect, it } from 'vitest';
import {
  getMessagesMenuItemsForScope,
  isOrgMessagesRouteScope,
  MESSAGES_MENU_ITEMS,
} from './messages-menu-items.config';

describe('MESSAGES_MENU_ITEMS', () => {
  it.each([
    ['Inbox', '/messages'],
    ['Outreach sequences', '/messages/outreach'],
    ['Replies', '/messages/replies'],
    ['Reply drip', '/messages/reply-drip'],
  ])('uses the canonical messages route for %s', (label, canonicalHref) => {
    const item = MESSAGES_MENU_ITEMS.find(
      (menuItem) => menuItem.label === label,
    );
    expect(item).toMatchObject({ href: canonicalHref });
  });

  it('treats empty and tilde brand slugs as org messages scope', () => {
    expect(isOrgMessagesRouteScope('')).toBe(true);
    expect(isOrgMessagesRouteScope('~')).toBe(true);
    expect(isOrgMessagesRouteScope('default')).toBe(false);
  });

  it('hides brand-only Messages destinations on org scope', () => {
    const orgItems = getMessagesMenuItemsForScope('~');
    expect(orgItems.map((item) => item.label)).toEqual(['Inbox']);
    expect(orgItems.some((item) => item.href === '/messages/outreach')).toBe(
      false,
    );
    expect(orgItems.every((item) => item.group === undefined)).toBe(true);

    const brandItems = getMessagesMenuItemsForScope('default');
    expect(brandItems.length).toBe(MESSAGES_MENU_ITEMS.length);
    expect(brandItems.map((item) => item.href)).toEqual([
      '/messages',
      '/messages/outreach',
      '/messages/replies',
      '/messages/reply-drip',
    ]);
  });
});

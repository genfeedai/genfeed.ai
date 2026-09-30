import { describe, expect, it } from 'vitest';
import {
  getMessagesMenuItemsForScope,
  isOrgMessagesRouteScope,
  MESSAGES_MENU_ITEMS,
} from './messages-menu-items.config';

describe('MESSAGES_MENU_ITEMS', () => {
  it('is non-empty', () => {
    expect(MESSAGES_MENU_ITEMS.length).toBeGreaterThan(0);
  });

  it('leads with Inbox, then Engage destinations', () => {
    expect(MESSAGES_MENU_ITEMS.map((item) => item.label)).toEqual([
      'Inbox',
      'Outreach sequences',
      'Replies',
      'Reply drip',
    ]);
  });

  it('has no duplicate hrefs', () => {
    const hrefs = MESSAGES_MENU_ITEMS.flatMap((item) =>
      item.href ? [item.href] : [],
    );
    expect(hrefs.length).toBe(new Set(hrefs).size);
  });

  it('all hrefs stay on the messages surface', () => {
    for (const item of MESSAGES_MENU_ITEMS) {
      expect(item.href).toMatch(/^\/messages(?:\/|$)/);
    }
  });

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

  it('does not use the word Campaigns in Messages nav', () => {
    expect(
      MESSAGES_MENU_ITEMS.some((item) =>
        item.label.toLowerCase().includes('campaign'),
      ),
    ).toBe(false);
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

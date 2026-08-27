import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models/base/base-entity.model', () => ({
  BaseEntity: class BaseEntity {
    public id?: string;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
}));

import { RssSource } from './rss-source.model';

describe('RssSource (client model)', () => {
  it('constructs with partial data', () => {
    const source = new RssSource({
      feedUrl: 'https://example.com/feed.xml',
      id: 'rss-1',
      label: 'Tech feed',
    });
    expect(source.id).toBe('rss-1');
    expect(source.label).toBe('Tech feed');
    expect(source.feedUrl).toBe('https://example.com/feed.xml');
  });
});

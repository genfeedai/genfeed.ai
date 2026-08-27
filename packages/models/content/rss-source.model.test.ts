import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  RssSource: class BaseRssSource {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class Brand {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/organization.model', () => ({
  Organization: class Organization {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { RssSource } from './rss-source.model';

describe('RssSource', () => {
  it('hydrates nested organization, brand, and user objects', () => {
    const source = new RssSource({
      brand: { id: 'brand-1' },
      id: 'rss-1',
      organization: { id: 'org-1' },
      user: { id: 'user-1' },
    });
    expect(source.organization).toMatchObject({ id: 'org-1' });
    expect(source.brand).toMatchObject({ id: 'brand-1' });
    expect(source.user).toMatchObject({ id: 'user-1' });
  });
});

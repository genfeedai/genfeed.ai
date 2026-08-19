import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  PostingSet: class BasePostingSet {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
  PostingSignature: class BasePostingSignature {
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

import { PostingSet, PostingSignature } from './posting-set.model';

describe('PostingSignature', () => {
  it('hydrates nested organization, brand, and user objects', () => {
    const signature = new PostingSignature({
      brand: { id: 'brand-1' },
      id: 'sig-1',
      organization: { id: 'org-1' },
      user: { id: 'user-1' },
    });
    expect(signature.organization).toMatchObject({ id: 'org-1' });
    expect(signature.brand).toMatchObject({ id: 'brand-1' });
    expect(signature.user).toMatchObject({ id: 'user-1' });
  });
});

describe('PostingSet', () => {
  it('hydrates nested organization, brand, and user objects', () => {
    const postingSet = new PostingSet({
      brand: { id: 'brand-1' },
      id: 'set-1',
      organization: { id: 'org-1' },
      user: { id: 'user-1' },
    });
    expect(postingSet.organization).toMatchObject({ id: 'org-1' });
    expect(postingSet.brand).toMatchObject({ id: 'brand-1' });
    expect(postingSet.user).toMatchObject({ id: 'user-1' });
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models/base/base-entity.model', () => ({
  BaseEntity: class BaseEntity {
    public id?: string;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
}));

import { PostingSet, PostingSignature } from './posting-set.model';

describe('PostingSet (client model)', () => {
  it('constructs with partial data', () => {
    const postingSet = new PostingSet({
      id: 'set-1',
      label: 'Launch channels',
    });
    expect(postingSet.id).toBe('set-1');
    expect(postingSet.label).toBe('Launch channels');
  });
});

describe('PostingSignature (client model)', () => {
  it('constructs with partial data', () => {
    const signature = new PostingSignature({
      body: 'Built with Genfeed.',
      id: 'sig-1',
      label: 'X footer',
    });
    expect(signature.id).toBe('sig-1');
    expect(signature.body).toBe('Built with Genfeed.');
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models/base/base-entity.model', () => ({
  BaseEntity: class BaseEntity {
    public id?: string;
    public isDeleted?: boolean;
    public createdAt?: string;
    public updatedAt?: string;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
}));

vi.mock('@genfeedai/interfaces', () => ({}));

import { MoodBoard } from './mood-board.model';

describe('MoodBoard (client model)', () => {
  it('constructs with empty data', () => {
    const board = new MoodBoard();
    expect(board).toBeDefined();
  });

  it('constructs with partial data', () => {
    const board = new MoodBoard({ id: 'board-1', brandId: 'brand-1' });
    expect(board.id).toBe('board-1');
    expect(board.brandId).toBe('brand-1');
  });

  it('sets layout from partial', () => {
    const layout = [{ assetId: 'asset-1', position: { x: 0, y: 0 } }];
    const board = new MoodBoard({ layout });
    expect(board.layout).toEqual(layout);
  });
});

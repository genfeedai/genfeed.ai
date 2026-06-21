import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  MoodBoard: class BaseMoodBoard {
    public id?: string;
    public brandId?: string;
    public organizationId?: string;
    public layout?: unknown[];
    public metadata?: Record<string, unknown>;
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@genfeedai/interfaces', () => ({}));

import { MoodBoard } from './mood-board.model';

describe('MoodBoard (domain model)', () => {
  it('constructs with partial data', () => {
    const board = new MoodBoard({ id: 'board-1' });
    expect(board).toBeDefined();
    expect(board.id).toBe('board-1');
  });

  it('assigns layout', () => {
    const layout = [{ assetId: 'a1', position: { x: 10, y: 20 } }];
    const board = new MoodBoard({ layout });
    expect(board.layout).toEqual(layout);
  });

  it('assigns brandId and organizationId', () => {
    const board = new MoodBoard({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });
    expect(board.brandId).toBe('brand-1');
    expect(board.organizationId).toBe('org-1');
  });
});

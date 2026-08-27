import { CreativePatternsService } from '@server/collections/creative-patterns/creative-patterns.service';
import { scopedWhere } from '@genfeedai/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/server', () => ({
  scopedWhere: vi.fn((organizationId: string, where: object) => ({
    isDeleted: false,
    ...where,
    organizationId,
  })),
}));

describe('CreativePatternsService.findAll', () => {
  const prisma = {
    creativePattern: {
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    prisma.creativePattern.findMany.mockReset();
    prisma.creativePattern.findMany.mockResolvedValue([]);
    vi.mocked(scopedWhere).mockClear();
  });

  it('scopes the list to the session organization', async () => {
    const service = new CreativePatternsService(prisma as never);

    await service.findAll({ organizationId: 'org-1' });

    expect(scopedWhere).toHaveBeenCalledWith('org-1', {});
    expect(prisma.creativePattern.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});

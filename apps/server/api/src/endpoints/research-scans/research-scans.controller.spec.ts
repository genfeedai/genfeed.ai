import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ResearchScansController } from './research-scans.controller';

describe('ResearchScansController', () => {
  it('lists the scans left for the caller organization only', async () => {
    const statuses = [
      {
        hasPlan: false,
        library: 'trends' as const,
        limit: { maxScans: 1, windowMs: 604_800_000 },
        nextAvailableAt: null,
        remaining: 1,
        used: 0,
      },
    ];
    const getStatuses = vi.fn().mockResolvedValue(statuses);
    const controller = new ResearchScansController({ getStatuses } as never);

    await expect(
      controller.list({ organizationId: 'org-1' } as AuthenticatedUser),
    ).resolves.toEqual({ data: statuses });
    expect(getStatuses).toHaveBeenCalledWith('org-1');
  });

  it('refuses a caller with no organization', async () => {
    const controller = new ResearchScansController({} as never);

    await expect(
      controller.list({ organizationId: '' } as AuthenticatedUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

import type { AdminPromptsQueryDto } from '@api/collections/prompts/dto/admin-prompts-query.dto';
import {
  AdminPromptsService,
  buildAdminPromptsWhere,
} from '@api/collections/prompts/services/admin-prompts.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@libs/prisma/tenant-context', () => ({
  crossOrgUnsafe: <T>(work: () => T) => work(),
}));

const query = (partial: Partial<AdminPromptsQueryDto> = {}) =>
  partial as AdminPromptsQueryDto;

describe('buildAdminPromptsWhere', () => {
  it('keeps only live prompts with no generation', () => {
    expect(buildAdminPromptsWhere(query())).toEqual({
      ingredients: { none: {} },
      isDeleted: false,
    });
  });

  it('narrows by organization and brand and searches the prompt and user email', () => {
    expect(
      buildAdminPromptsWhere(
        query({ brandId: 'brand-1', organizationId: 'org-1', search: ' cat ' }),
      ),
    ).toEqual({
      OR: [
        { original: { contains: 'cat', mode: 'insensitive' } },
        { enhanced: { contains: 'cat', mode: 'insensitive' } },
        { user: { is: { email: { contains: 'cat', mode: 'insensitive' } } } },
      ],
      brandId: 'brand-1',
      ingredients: { none: {} },
      isDeleted: false,
      organizationId: 'org-1',
    });
  });
});

describe('AdminPromptsService', () => {
  it('reads across organizations with the owner and organization included', async () => {
    const prompts = { findAll: vi.fn().mockResolvedValue({ docs: [] }) };
    const service = new AdminPromptsService(prompts as never);

    await service.withoutGeneration(query({ page: 1 }));

    const [aggregate] = prompts.findAll.mock.calls[0];
    expect(aggregate.where).toMatchObject({ ingredients: { none: {} } });
    expect(Object.keys(aggregate.include)).toEqual(['organization', 'user']);
  });
});
